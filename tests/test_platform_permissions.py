"""The REBAC-schema reconcile that keeps schema drift from deadlocking checks.

When an addon leaves ``INSTALLED_APPS``, ``rebac sync`` never revisits it, so its
``Schema*`` rows orphan and the library's ``rebac.E009`` check then blocks every
checked command (``makemigrations``, ``migrate``, ``rebac sync``) — breaking the
rebuild the uninstall triggers. ``platform``'s ``reconcile_permission_schema`` (run
check-free by the ``reconcile_permissions`` command) is the global prune that removes
those orphans and stale rows inside still-composed packages.
"""

from __future__ import annotations


def _managed(package: str, resource_type: str):
    """Create a SchemaDefinition with a PackageManagedRecord owning it, as sync would."""

    from django.contrib.contenttypes.models import ContentType
    from django.utils import timezone
    from rebac.models import PackageManagedRecord, SchemaDefinition

    definition = SchemaDefinition.objects.create(resource_type=resource_type)
    PackageManagedRecord.objects.create(
        package=package,
        external_id=f"definition:{resource_type}",
        schema_revision=1,
        target_ct=ContentType.objects.get_for_model(SchemaDefinition),
        target_pk=definition.pk,
        content_hash="x",
        last_synced_at=timezone.now(),
    )
    return definition


def _managed_relation(package: str, resource_type: str, name: str):
    """Create a SchemaRelation with package-managed provenance."""

    from django.contrib.contenttypes.models import ContentType
    from django.utils import timezone
    from rebac.models import PackageManagedRecord, SchemaDefinition, SchemaRelation

    definition = SchemaDefinition.objects.create(resource_type=resource_type)
    relation = SchemaRelation.objects.create(
        definition=definition,
        name=name,
        allowed_subjects=[{"type": "auth/user", "relation": "", "wildcard": False}],
        backing={"attname": "created_by", "kind": "fk"},
    )
    PackageManagedRecord.objects.create(
        package=package,
        external_id=f"definition:{resource_type}",
        schema_revision=1,
        target_ct=ContentType.objects.get_for_model(SchemaDefinition),
        target_pk=definition.pk,
        content_hash="x",
        last_synced_at=timezone.now(),
    )
    PackageManagedRecord.objects.create(
        package=package,
        external_id=f"relation:{resource_type}#{name}",
        schema_revision=1,
        target_ct=ContentType.objects.get_for_model(SchemaRelation),
        target_pk=relation.pk,
        content_hash="x",
        last_synced_at=timezone.now(),
    )
    return definition, relation


def test_reconcile_prunes_orphaned_package_and_keeps_composed(db) -> None:
    """A managed row whose package is not a composed app is pruned with its target,
    while a row for a composed app survives untouched."""

    from django.apps import apps
    from rebac.models import PackageManagedRecord, SchemaDefinition

    from angee.platform.permissions import reconcile_permission_schema

    orphan = _managed("ghost.addon", "ghost/thing")  # no such app in the composed set
    kept_package = apps.get_app_config("contenttypes").name  # a composed app
    kept = _managed(kept_package, "ghost/kept")

    assert reconcile_permission_schema() == 1

    assert not SchemaDefinition.objects.filter(pk=orphan.pk).exists()
    assert not PackageManagedRecord.objects.filter(package="ghost.addon").exists()
    assert SchemaDefinition.objects.filter(pk=kept.pk).exists()
    assert PackageManagedRecord.objects.filter(package=kept_package).exists()


def test_reconcile_prunes_stale_rows_inside_composed_package(db) -> None:
    """A removed definition in a still-installed addon is pruned before checks run."""

    from django.apps import apps
    from rebac.models import PackageManagedRecord, SchemaDefinition, SchemaRelation

    from angee.platform.permissions import reconcile_permission_schema

    package = apps.get_app_config("messaging").name
    stale_definition, stale_relation = _managed_relation(
        package,
        "messaging/message_metrics",
        "owner",
    )
    kept = _managed(package, "messaging/message")

    assert reconcile_permission_schema() == 2

    assert not SchemaRelation.objects.filter(pk=stale_relation.pk).exists()
    assert not SchemaDefinition.objects.filter(pk=stale_definition.pk).exists()
    assert not PackageManagedRecord.objects.filter(
        package=package,
        external_id__in=(
            "definition:messaging/message_metrics",
            "relation:messaging/message_metrics#owner",
        ),
    ).exists()
    assert SchemaDefinition.objects.filter(pk=kept.pk).exists()
    assert PackageManagedRecord.objects.filter(
        package=package,
        external_id="definition:messaging/message",
    ).exists()


def test_reconcile_is_a_noop_when_nothing_stale(db) -> None:
    """Every managed package composed (here: none managed at all) prunes nothing."""

    from angee.platform.permissions import reconcile_permission_schema

    assert reconcile_permission_schema() == 0
