import six
from django.core.exceptions import ValidationError
from rest_framework import serializers
from rest_framework.response import Response
from sentry import features
from sentry.api.base import EnvironmentMixin
from sentry.api.bases.organization import OrganizationEndpoint, OrganizationDataExportPermission
from sentry.api.event_search import get_filter, InvalidSearchQuery
from sentry.api.serializers import serialize
from sentry.api.utils import get_date_range_from_params
from sentry.models import Environment
from sentry.utils import metrics
from sentry.utils.compat import map
from sentry.utils.snuba import MAX_FIELDS

from ..base import ExportQueryType
from ..models import ExportedData
from ..tasks import assemble_download
from ..processors.discover import DiscoverProcessor


class DataExportQuerySerializer(serializers.Serializer):
    query_type = serializers.ChoiceField(choices=ExportQueryType.as_str_choices(), required=True)
    query_info = serializers.JSONField(required=True)

    def validate(self, data):
        organization = self.context["organization"]
        query_info = data["query_info"]

        # Validate the project field, if provided
        # A PermissionDenied error will be raised in `get_projects_by_id` if the request is invalid
        project_query = query_info.get("project")
        if project_query:
            get_projects_by_id = self.context["get_projects_by_id"]
            # Coerce the query into a set
            if isinstance(project_query, list):
                projects = get_projects_by_id(set(map(int, project_query)))
            else:
                projects = get_projects_by_id({int(project_query)})
            query_info["project"] = [project.id for project in projects]

        # Discover Pre-processing
        if data["query_type"] == ExportQueryType.DISCOVER_STR:
            # coerce the fields into a list as needed
            fields = query_info.get("field", [])
            if not isinstance(fields, list):
                fields = [fields]

            if len(fields) > MAX_FIELDS:
                detail = "You can export up to {} fields at a time. Please delete some and try again.".format(
                    MAX_FIELDS
                )
                raise serializers.ValidationError(detail)

            query_info["field"] = fields

            if "project" not in query_info:
                projects = self.context["get_projects"]()
                query_info["project"] = [project.id for project in projects]

            # make sure to fix the export start/end times to ensure consistent results
            start, end = get_date_range_from_params(query_info)
            if "statsPeriod" in query_info:
                del query_info["statsPeriod"]
            if "statsPeriodStart" in query_info:
                del query_info["statsPeriodStart"]
            if "statsPeriodEnd" in query_info:
                del query_info["statsPeriodEnd"]
            query_info["start"] = start.isoformat()
            query_info["end"] = end.isoformat()

            # validate the query string by trying to parse it
            processor = DiscoverProcessor(
                discover_query=query_info,
                organization_id=organization.id,
            )
            try:
                get_filter(query_info["query"], processor.params)
            except InvalidSearchQuery as err:
                raise serializers.ValidationError(six.text_type(err))

        return data


class DataExportEndpoint(OrganizationEndpoint, EnvironmentMixin):
    permission_classes = (OrganizationDataExportPermission,)

    def post(self, request, organization):
        """
        Create a new asynchronous file export task, and
        email user upon completion,
        """
        # The data export feature is only available alongside `discover-query`.
        # So to export issue tags, they must have have `discover-query`
        if not features.has("organizations:discover-query", organization):
            return Response(status=404)

        # Get environment_id and limit if available
        try:
            environment_id = self._get_environment_id_from_request(request, organization.id)
        except Environment.DoesNotExist as error:
            return Response(error, status=400)
        limit = request.data.get("limit")

        # Validate the data export payload
        serializer = DataExportQuerySerializer(
            data=request.data,
            context={
                "organization": organization,
                "get_projects_by_id": lambda project_query: self._get_projects_by_id(
                    project_query, request, organization
                ),
                "get_projects": lambda: self.get_projects(request, organization),
            },
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        data = serializer.validated_data

        try:
            # If this user has sent a request with the same payload and organization,
            # we return them the latest one that is NOT complete (i.e. don't start another)
            query_type = ExportQueryType.from_str(data["query_type"])
            data_export, created = ExportedData.objects.get_or_create(
                organization=organization,
                user=request.user,
                query_type=query_type,
                query_info=data["query_info"],
                date_finished=None,
            )
            status = 200
            if created:
                metrics.incr(
                    "dataexport.enqueue", tags={"query_type": data["query_type"]}, sample_rate=1.0
                )
                assemble_download.delay(
                    data_export_id=data_export.id, export_limit=limit, environment_id=environment_id
                )
                status = 201
        except ValidationError as e:
            # This will handle invalid JSON requests
            metrics.incr(
                "dataexport.invalid", tags={"query_type": data.get("query_type")}, sample_rate=1.0
            )
            return Response({"detail": six.text_type(e)}, status=400)
        return Response(serialize(data_export, request.user), status=status)
