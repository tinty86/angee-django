"""GraphQL composition for source addons.

Addons contribute schema parts and lean on the shortcuts re-exported here:
``crud`` for library-backed CRUD mutations and ``changes`` for model change
subscriptions. The framework merges the parts into named schemas.
"""

from angee.base.graphql.crud import crud
from angee.base.graphql.schema import (
    DEFAULT_SCHEMA_NAME,
    build_schema,
    collect_schema_names,
    collect_schema_parts,
    render_sdl,
)
from angee.base.graphql.subscriptions import ChangeEvent, changes

__all__ = [
    "DEFAULT_SCHEMA_NAME",
    "ChangeEvent",
    "build_schema",
    "changes",
    "collect_schema_names",
    "collect_schema_parts",
    "crud",
    "render_sdl",
]
