"""F6 — editable lines + transactional nested write, backend half.

Exercises ``hasura_model_resource(lines=...)`` over the ``linesdemo`` demo
document/line pair: the Hasura-native nested insert writes a parent and its
children atomically (rolling back on a child failure), the authored
``<res>_save`` mutation diff-applies children (create/update/delete by public
id) plus patches the parent in one transaction, the parent write is the REBAC
gate (an actor without write is denied wholesale), and the ``position`` column
round-trips.
"""

from __future__ import annotations

from typing import Any

import pytest
import strawberry
import strawberry_django
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rebac import (
    RelationshipTuple,
    actor_context,
    system_context,
    to_object_ref,
    to_subject_ref,
    write_relationships,
)
from strawberry import auto

from angee.graphql.data.hasura import HasuraLines, hasura_model_resource
from angee.graphql.data.metadata import data_resource_metadata, merge_data_resources
from angee.graphql.node import AngeeNode
from tests.conftest import create_user, execute_schema, result_data
from tests.linesdemo.models import Product, SaleDoc, SaleLine


@strawberry_django.type(SaleLine)
class SaleLineType(AngeeNode):
    """GraphQL projection of one document line."""

    label: auto
    quantity: auto
    position: auto


@strawberry_django.type(SaleDoc)
class SaleDocType(AngeeNode):
    """GraphQL projection of a document with its ordered lines."""

    title: auto
    note: auto

    @strawberry_django.field
    def lines(self) -> list[SaleLineType]:
        return list(self.lines.order_by("position", "pk"))


_LINES = HasuraLines(
    field="lines",
    model=SaleLine,
    node=SaleLineType,
    writable=("label", "quantity", "position"),
)

_RESOURCE = hasura_model_resource(
    SaleDocType,
    model=SaleDoc,
    name="sale_docs",
    filterable=["id", "title"],
    sortable=["title"],
    aggregatable=["id"],
    writable=["title", "note"],
    lines=_LINES,
    id_column="sqid",
)

_SCHEMA = strawberry.Schema(
    query=_RESOURCE.query,
    mutation=_RESOURCE.mutation,
    types=[SaleDocType, SaleLineType, *_RESOURCE.types],
)

# A second resource whose lines expose the ``product`` relation as a public id, so
# the write must decode it under the caller's actor (the finding #5 handle).
_LINES_WITH_PRODUCT = HasuraLines(
    field="lines",
    model=SaleLine,
    node=SaleLineType,
    writable=("label", "quantity", "position", "product"),
    public_id_fields=("product",),
)

_RESOURCE_WITH_PRODUCT = hasura_model_resource(
    SaleDocType,
    model=SaleDoc,
    name="sale_docs_prod",
    filterable=["id", "title"],
    sortable=["title"],
    aggregatable=["id"],
    writable=["title", "note"],
    lines=_LINES_WITH_PRODUCT,
    id_column="sqid",
)

_SCHEMA_WITH_PRODUCT = strawberry.Schema(
    query=_RESOURCE_WITH_PRODUCT.query,
    mutation=_RESOURCE_WITH_PRODUCT.mutation,
    types=[SaleDocType, SaleLineType, *_RESOURCE_WITH_PRODUCT.types],
)


@pytest.fixture()
def linesdemo_tables(transactional_db: Any):
    """Ensure the demo tables exist and the REBAC schema is synced."""

    existing = set(connection.introspection.table_names())
    created = [m for m in (SaleDoc, Product, SaleLine) if m._meta.db_table not in existing]
    if created:
        with connection.schema_editor() as editor:
            for model in created:
                editor.create_model(model)
    call_command("rebac", "sync", verbosity=0)
    try:
        yield
    finally:
        with connection.cursor() as cursor:
            for model in (SaleLine, Product, SaleDoc):
                cursor.execute(f"DELETE FROM {connection.ops.quote_name(model._meta.db_table)}")


def _grant(document: SaleDoc, relation: str, user: Any) -> None:
    """Write one direct relationship tuple for ``user`` on ``document``."""

    write_relationships(
        [
            RelationshipTuple(
                resource=to_object_ref(document),
                relation=relation,
                subject=to_subject_ref(user),
            )
        ]
    )


def _grant_owner(document: SaleDoc, user: Any) -> None:
    """Write the ``owner`` relationship that grants write on a document."""

    _grant(document, "owner", user)


_INSERT = """
mutation($object: sale_docs_insert_input!) {
  insert_sale_docs_one(object: $object) {
    id
    lines { id label quantity position }
  }
}
"""

_SAVE = """
mutation($pk: ID!, $patch: sale_docs_set_input, $lines: [sale_docs_lines_insert_input!]) {
  sale_docs_save(pk: $pk, patch: $patch, lines: $lines) {
    id
    title
    lines { id label quantity position }
  }
}
"""


def test_nested_insert_writes_parent_and_lines_atomically(linesdemo_tables):
    """One insert mutation persists the document and its child lines."""

    actor = create_user("author")
    result = execute_schema(
        _SCHEMA,
        _INSERT,
        {
            "object": {
                "title": "Quotation",
                "lines": {
                    "data": [
                        {"label": "Widget", "quantity": 2, "position": 0},
                        {"label": "Gadget", "quantity": 5, "position": 1},
                    ]
                },
            }
        },
        user=actor,
    )
    data = result_data(result)
    assert len(data["insert_sale_docs_one"]["lines"]) == 2
    with system_context(reason="test read"):
        doc = SaleDoc.objects.get(title="Quotation")
        rows = list(doc.lines.order_by("position").values_list("label", "quantity", "position"))
    assert rows == [("Widget", 2, 0), ("Gadget", 5, 1)]


def test_nested_insert_rolls_back_parent_on_line_failure(linesdemo_tables):
    """A child validation failure rolls the whole nested insert back."""

    actor = create_user("author")
    result = execute_schema(
        _SCHEMA,
        _INSERT,
        {
            "object": {
                "title": "Doomed",
                "lines": {
                    "data": [
                        {"label": "ok", "quantity": 1, "position": 0},
                        {"label": "x" * 400, "quantity": 1, "position": 1},
                    ]
                },
            }
        },
        user=actor,
    )
    assert result.errors is not None
    with system_context(reason="test read"):
        assert not SaleDoc.objects.filter(title="Doomed").exists()
        assert not SaleLine.objects.filter(label="ok").exists()


def test_save_diffs_lines_create_update_delete_in_one_transaction(linesdemo_tables):
    """``_save`` creates/updates/deletes children and patches the parent atomically."""

    owner = create_user("owner")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order", note="draft")
        keep = SaleLine.objects.create(document=doc, label="Keep", quantity=1, position=0)
        drop = SaleLine.objects.create(document=doc, label="Drop", quantity=9, position=1)
    _grant_owner(doc, owner)

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {
            "pk": doc.public_id,
            "patch": {"note": "confirmed"},
            "lines": [
                {"id": keep.public_id, "label": "Keep", "quantity": 3, "position": 0},
                {"label": "New", "quantity": 7, "position": 1},
            ],
        },
        user=owner,
    )
    data = result_data(result)
    assert data["sale_docs_save"]["title"] == "Order"

    with system_context(reason="test read"):
        doc.refresh_from_db()
        assert doc.note == "confirmed"
        rows = list(doc.lines.order_by("position").values_list("label", "quantity", "position"))
    # ``keep`` updated to quantity 3, ``drop`` removed, ``New`` created.
    assert rows == [("Keep", 3, 0), ("New", 7, 1)]
    with system_context(reason="test read"):
        assert not SaleLine.objects.filter(pk=drop.pk).exists()


def test_save_without_lines_leaves_children_untouched(linesdemo_tables):
    """Omitting ``lines`` is a parent-only save; the children are left alone."""

    owner = create_user("owner")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order", note="draft")
        SaleLine.objects.create(document=doc, label="Line", quantity=1, position=0)
    _grant_owner(doc, owner)

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {"pk": doc.public_id, "patch": {"note": "confirmed"}},
        user=owner,
    )
    result_data(result)
    with system_context(reason="test read"):
        doc.refresh_from_db()
        assert doc.note == "confirmed"
        assert doc.lines.count() == 1


def test_save_denies_actor_without_write_on_parent(linesdemo_tables):
    """An actor with no write on the parent is denied — the row is never found."""

    owner = create_user("owner")
    intruder = create_user("intruder")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order")
        line = SaleLine.objects.create(document=doc, label="Line", quantity=1, position=0)
    _grant_owner(doc, owner)

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {
            "pk": doc.public_id,
            "patch": {"title": "Hijacked"},
            "lines": [{"id": line.public_id, "label": "Tampered", "quantity": 99, "position": 0}],
        },
        user=intruder,
    )
    assert result.errors is not None
    with system_context(reason="test read"):
        doc.refresh_from_db()
        line.refresh_from_db()
    assert doc.title == "Order"
    assert line.label == "Line" and line.quantity == 1


def test_save_denies_reader_without_write_even_with_empty_patch(linesdemo_tables):
    """A reader (read, no write) is denied a lines-only save — the write-gate hole.

    The ``reader`` grant makes ``read`` and ``write`` diverge, so the parent row
    loads (read scope passes) yet the actor lacks write. An empty patch skips the
    update resolver's write signal, so only the unconditional ``has_access`` gate
    stops the child elevation; without it a read-only actor could rewrite lines.
    """

    owner = create_user("owner")
    reader = create_user("reader")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order")
        line = SaleLine.objects.create(document=doc, label="Line", quantity=1, position=0)
    _grant_owner(doc, owner)
    _grant(doc, "reader", reader)

    # The reader can load the parent — proving the denial is the write gate, not
    # the read scope failing to find the row.
    with actor_context(reader):
        assert SaleDoc.objects.filter(pk=doc.pk).exists()

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {
            "pk": doc.public_id,
            "lines": [
                {"id": line.public_id, "label": "Tampered", "quantity": 99, "position": 0},
                {"label": "Injected", "quantity": 1, "position": 1},
            ],
        },
        user=reader,
    )
    assert result.errors is not None
    with system_context(reason="test read"):
        line.refresh_from_db()
        assert line.label == "Line" and line.quantity == 1
        assert doc.lines.count() == 1


def test_save_rejects_line_ids_not_on_the_parent(linesdemo_tables):
    """A line id absent from the parent's stored set is rejected wholesale.

    Enforces the completeness contract server-side: a stale/foreign/truncated
    baseline (here a line belonging to another document) fails with a clear error
    instead of being silently mis-applied.
    """

    owner = create_user("owner")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order")
        mine = SaleLine.objects.create(document=doc, label="Mine", quantity=1, position=0)
        other_doc = SaleDoc.objects.create(title="Other")
        foreign = SaleLine.objects.create(document=other_doc, label="Foreign", quantity=1, position=0)
    _grant_owner(doc, owner)

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {
            "pk": doc.public_id,
            "lines": [
                {"id": mine.public_id, "label": "Mine", "quantity": 2, "position": 0},
                {"id": foreign.public_id, "label": "Hijack", "quantity": 9, "position": 1},
            ],
        },
        user=owner,
    )
    assert result.errors is not None
    with system_context(reason="test read"):
        mine.refresh_from_db()
        foreign.refresh_from_db()
    # The whole diff rolled back: the legitimate update did not apply either.
    assert mine.quantity == 1
    assert foreign.label == "Foreign"


def test_save_fetches_kept_lines_without_per_row_growth(linesdemo_tables):
    """The kept-child fetch is batched: its query cost does not grow per row (no N+1)."""

    owner = create_user("owner")
    table = connection.ops.quote_name(SaleLine._meta.db_table)

    def child_selects_for(line_count: int) -> int:
        with system_context(reason="seed"):
            doc = SaleDoc.objects.create(title="Order")
            kept = [
                SaleLine.objects.create(document=doc, label=f"L{index}", quantity=1, position=index)
                for index in range(line_count)
            ]
        _grant_owner(doc, owner)
        lines = [
            {"id": line.public_id, "label": line.label, "quantity": 2, "position": index}
            for index, line in enumerate(kept)
        ]
        with CaptureQueriesContext(connection) as captured:
            result = execute_schema(_SCHEMA, _SAVE, {"pk": doc.public_id, "lines": lines}, user=owner)
        result_data(result)
        return sum(
            1
            for query in captured.captured_queries
            if query["sql"].lstrip().upper().startswith("SELECT") and table in query["sql"]
        )

    # A per-row fetch (the old N+1) would make the 5-line save cost strictly more
    # child SELECTs than the 2-line save; the batched fetch keeps them equal.
    assert child_selects_for(2) == child_selects_for(5)


def test_save_locks_the_parent_row_before_diffing_lines(linesdemo_tables, monkeypatch):
    """The child diff runs under a parent-row lock (serializes concurrent saves).

    A true cross-delete race needs two Postgres connections; on the SQLite floor
    ``lock_if_supported`` is a no-op, so this pins the seam: the diff acquires the
    lock through the base helper, targeting the parent model, before touching the
    child set.
    """

    from angee.base.models import AngeeQuerySet

    locked_models: list[type] = []
    original = AngeeQuerySet.lock_if_supported

    def spy(self: Any, **kwargs: Any) -> Any:
        locked_models.append(self.model)
        return original(self, **kwargs)

    monkeypatch.setattr(AngeeQuerySet, "lock_if_supported", spy)

    owner = create_user("owner")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order")
        line = SaleLine.objects.create(document=doc, label="Line", quantity=1, position=0)
    _grant_owner(doc, owner)

    result = execute_schema(
        _SCHEMA,
        _SAVE,
        {"pk": doc.public_id, "lines": [{"id": line.public_id, "label": "Line", "quantity": 2, "position": 0}]},
        user=owner,
    )
    result_data(result)
    assert SaleDoc in locked_models


def test_save_decodes_line_relation_under_the_callers_actor(linesdemo_tables):
    """A line referencing a product the caller cannot read is rejected before elevation.

    The relation decode runs under the caller's actor (phase 1), so an invisible
    product is not resolved by the §3.4 child elevation; a visible one goes through.
    """

    owner = create_user("owner")
    with system_context(reason="seed"):
        doc = SaleDoc.objects.create(title="Order")
        visible = Product.objects.create(name="Visible")
        hidden = Product.objects.create(name="Hidden")
    _grant_owner(doc, owner)
    _grant(visible, "owner", owner)  # the caller may read `visible`, not `hidden`

    _SAVE_PROD = """
    mutation($pk: ID!, $lines: [sale_docs_prod_lines_insert_input!]) {
      sale_docs_prod_save(pk: $pk, lines: $lines) {
        id
        lines { id label quantity position }
      }
    }
    """

    denied = execute_schema(
        _SCHEMA_WITH_PRODUCT,
        _SAVE_PROD,
        {
            "pk": doc.public_id,
            "lines": [{"label": "L", "quantity": 1, "position": 0, "product": hidden.public_id}],
        },
        user=owner,
    )
    assert denied.errors is not None
    with system_context(reason="test read"):
        assert doc.lines.count() == 0

    ok = execute_schema(
        _SCHEMA_WITH_PRODUCT,
        _SAVE_PROD,
        {
            "pk": doc.public_id,
            "lines": [{"label": "L", "quantity": 1, "position": 0, "product": visible.public_id}],
        },
        user=owner,
    )
    result_data(ok)
    with system_context(reason="test read"):
        assert doc.lines.get().product_id == visible.pk


def test_lines_require_the_parent_update_surface():
    """Declaring lines with ``update=False`` fails fast at build, not at first save."""

    with pytest.raises(ImproperlyConfigured, match="update=False"):
        hasura_model_resource(
            SaleDocType,
            model=SaleDoc,
            name="sale_docs_readonly",
            filterable=["id", "title"],
            sortable=["title"],
            aggregatable=["id"],
            writable=["title", "note"],
            lines=_LINES,
            update=False,
            id_column="sqid",
        )


def test_lines_require_a_lines_aware_write_backend():
    """A custom write backend without ``save`` is rejected at build, not at mutation."""

    class BareBackend:
        """A WriteBackend that never learned the authored ``save`` verb."""

        def create(self, info: Any, data: dict[str, Any]) -> Any: ...
        def update(self, info: Any, pk: str, data: dict[str, Any]) -> Any: ...
        def delete(self, info: Any, pk: str) -> Any: ...

    with pytest.raises(ImproperlyConfigured, match="lines-aware"):
        hasura_model_resource(
            SaleDocType,
            model=SaleDoc,
            name="sale_docs_bare",
            filterable=["id", "title"],
            sortable=["title"],
            aggregatable=["id"],
            writable=["title", "note"],
            lines=_LINES,
            write_backend=BareBackend(),
            id_column="sqid",
        )


def test_lines_resource_metadata_is_emitted():
    """The resource advertises the editable-lines contract + the save root."""

    merged = merge_data_resources(
        (
            *data_resource_metadata(_RESOURCE.query),
            *data_resource_metadata(_RESOURCE.mutation),
        )
    )
    (resource,) = [m for m in merged if m.model_label == "linesdemo.SaleDoc"]
    assert "save" in resource.capabilities
    assert resource.roots.save_name == "sale_docs_save"
    assert resource.lines is not None
    assert resource.lines.field == "lines"
    assert resource.lines.model_label == "linesdemo.SaleLine"
    assert resource.lines.position_field == "position"
    line_field_names = {field.name for field in resource.lines.fields}
    assert {"label", "quantity", "position"} <= line_field_names
    # The parent create fields must not leak the nested lines envelope.
    assert "lines" not in resource.create_fields
