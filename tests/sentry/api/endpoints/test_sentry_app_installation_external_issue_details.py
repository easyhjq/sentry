from sentry.models import PlatformExternalIssue
from sentry.testutils import APITestCase


class SentryAppInstallationExternalIssueDetailsEndpointTest(APITestCase):
    endpoint = "sentry-api-0-sentry-app-installation-external-issue-details"
    method = "delete"

    def setUp(self):
        self.user = self.create_user(email="boop@example.com")
        self.org = self.create_organization(owner=self.user)
        self.project = self.create_project(organization=self.org)
        self.group = self.create_group(project=self.project)
        self.sentry_app = self.create_sentry_app(
            name="testin",
            organization=self.org,
            webhook_url="https://example.com",
            scopes=["event:write", "event:admin"],
        )
        self.install = self.create_sentry_app_installation(
            organization=self.org, slug=self.sentry_app.slug, user=self.user
        )
        self.external_issue = self.create_platform_external_issue(
            group=self.group,
            service_type="sentry-app",
            display_name="App#issue-1",
            web_url="https://example.com/app/issues/1",
        )

    def test_deletes_external_issue(self):
        self.login_as(self.user)
        assert PlatformExternalIssue.objects.filter(id=self.external_issue.id).exists()
        self.get_valid_response(self.install.uuid, self.external_issue.id, status_code=204)
        assert not PlatformExternalIssue.objects.filter(id=self.external_issue.id).exists()
