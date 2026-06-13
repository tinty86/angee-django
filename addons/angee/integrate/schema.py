"""GraphQL schema contributions for Angee integrations.

Owns the admin surface for the third-party ``Vendor`` catalogue (moved here from
iam) and a read projection of ``Connection``. Connection lifecycle is driven by
the integration runtime, not generic admin CRUD, so only the catalogue is
mutated here.
"""

from __future__ import annotations

import strawberry
import strawberry_django
from django.apps import apps
from strawberry import auto, relay
from strawberry.scalars import JSON
from strawberry_django.pagination import OffsetPaginated

from angee.graphql.crud import crud
from angee.graphql.node import AngeeNode
from angee.graphql.subscriptions import changes
from angee.iam.permissions import ADMIN_PERMISSION_CLASSES as _ADMIN_PERMISSION_CLASSES

Vendor = apps.get_model("integrate", "Vendor")
Connection = apps.get_model("integrate", "Connection")


@strawberry_django.type(Vendor)
class VendorType(AngeeNode):
    """GraphQL projection of an integration vendor catalogue row."""

    slug: auto
    display_name: auto
    website_url: auto
    icon: auto
    description: auto
    created_at: auto
    updated_at: auto


@strawberry_django.type(Connection)
class ConnectionType(AngeeNode):
    """Admin read projection of an integration connection.

    Own columns only — the capability-health rollup and telemetry. Provider,
    credential, and owner associations are added with the console UI (deferred).
    """

    status: auto
    config: JSON
    capability_statuses: JSON
    last_used_at: auto
    last_error: auto
    created_at: auto
    updated_at: auto


@strawberry.input
class VendorInput:
    """Fields accepted when creating a vendor."""

    slug: str
    display_name: str
    website_url: str = ""
    icon: str = ""
    description: str = ""


@strawberry.input
class VendorPatch:
    """Fields accepted when updating a vendor."""

    id: relay.GlobalID
    slug: str | None = strawberry.UNSET
    display_name: str | None = strawberry.UNSET
    website_url: str | None = strawberry.UNSET
    icon: str | None = strawberry.UNSET
    description: str | None = strawberry.UNSET


@strawberry.type
class IntegrateConsoleQuery:
    """Admin integration catalogue and connection queries."""

    vendors: OffsetPaginated[VendorType] = strawberry_django.offset_paginated(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    vendor: VendorType | None = strawberry_django.node(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )
    connections: OffsetPaginated[ConnectionType] = strawberry_django.offset_paginated(
        permission_classes=_ADMIN_PERMISSION_CLASSES,
    )


_VENDOR_MUTATION = crud(
    VendorType,
    create=VendorInput,
    update=VendorPatch,
    delete=True,
    permission_classes=_ADMIN_PERMISSION_CLASSES,
    name="vendor",
    write_context="integrate.graphql.vendor",
)
"""Admin vendor CRUD: const-admin gated by ``PlatformAdminPermission``, written elevated."""


# Extracted with an explicit annotation: a bare homogeneous list of two
# AngeeNode-decorated types infers as ``list[type[AngeeNode]]`` and trips mypy's
# invariance check; ``list[type]`` widens it. (iam's inline lists are heterogeneous,
# so they don't hit this.)
_CONSOLE_TYPES: list[type] = [VendorType, ConnectionType]

schemas = {
    "console": {
        "query": [IntegrateConsoleQuery],
        "mutation": [_VENDOR_MUTATION],
        "subscription": [changes(Connection, field="connectionChanged")],
        "types": _CONSOLE_TYPES,
    },
}
"""GraphQL contributions installed by the integrate addon."""
