# Generated by Django 1.11.27 on 2020-02-01 00:39

from django.db import migrations
import sentry.db.models.fields.bounded


class Migration(migrations.Migration):
    # This flag is used to mark that a migration shouldn't be automatically run in
    # production. We set this to True for operations that we think are risky and want
    # someone from ops to run manually and monitor.
    # General advice is that if in doubt, mark your migration as `is_dangerous`.
    # Some things you should always mark as dangerous:
    # - Large data migrations. Typically we want these to be run manually by ops so that
    #   they can be monitored. Since data migrations will now hold a transaction open
    #   this is even more important.
    # - Adding columns to highly active tables, even ones that are NULL.
    is_dangerous = False

    # This flag is used to decide whether to run this migration in a transaction or not.
    # By default we prefer to run in a transaction, but for migrations where you want
    # to `CREATE INDEX CONCURRENTLY` this needs to be set to False. Typically you'll
    # want to create an index concurrently when adding one to an existing table.
    atomic = True

    dependencies = [("sentry", "0029_discover_query_upgrade")]

    operations = [
        migrations.AlterField(
            model_name="incidentsuspectcommit",
            name="commit",
            field=sentry.db.models.fields.bounded.BoundedBigIntegerField(
                db_column="commit_id", db_index=True
            ),
        ),
        migrations.AlterField(
            model_name="incidentsuspectcommit",
            name="incident",
            field=sentry.db.models.fields.bounded.BoundedBigIntegerField(db_column="incident_id"),
        ),
    ]
