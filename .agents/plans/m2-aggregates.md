# M2 — Notes aggregates via `strawberry-django-aggregates` (replace hand-rolled)

Status: **spec, design-validated by spike** (cursor + offset + multi-axis + REBAC
all proven against the real Note model). Implementation not started.

## Goal

Replace the hand-rolled `noteAggregate` surface with the library's
`AggregateBuilder`, giving the notes example **offset-paginated, multi-axis,
granularity-aware group-by** with REBAC scoping — and **delete ~95 lines** of
bespoke aggregation from angee. The aggregate engine owns aggregation; angee
owns only the REBAC seam.

## Division of labor (the standing rule for this work)

- **Capability gap** (granularity, having, ordering, pagination, key shapes) →
  build/extend in **`strawberry-django-aggregates`** (we control it), never
  hand-roll in angee.
- **REBAC binding** → angee's `get_queryset` hook — the one host-specific seam
  the library deliberately refuses to own (its SPEC §1 non-goal: "expects a
  pre-scoped queryset").
- **Recursive subgroup trees / per-group detail rows in one payload** → neither
  builds. The library SPEC §3.2 and Odoo's `_read_group` both refuse it
  ("pagination of trees is hellish… one query, all groupBy keys; drill-down is
  opt-in via repeated calls"). The pattern is **facet query + filtered detail
  query**, not a recursive tree.

For M2 the library is **untouched** — the `get_queryset` hook is sufficient
(proven). A reusable REBAC-scoping helper in the library is a backlog item, not
M2 scope (adding host-framework REBAC concepts to a deliberately agnostic
library needs more than one consumer to justify).

## Pagination decision: offset for groups, cursor for detail

Each pagination style is matched to its access pattern, not applied uniformly:

- **Group level → offset** (`pagination_style="offset"`, the library default).
  Group sets are small and bounded (status → 3; year×month → tens), recomputed
  per query (not a live feed), and the UI wants random access + "page N of M" +
  sort-by-count. Offset gives `results / pageInfo / totalCount` directly; that
  is exactly Odoo's `groups_limit` model. Cursor's guarantees (insert-stable
  deep paging of an unbounded feed) buy nothing here and can't express "page 3
  of 7".
- **Detail level → cursor** — the existing relay `notes(filters:, order:,
  first:, after:)` connection. *This* set is unbounded, infinite-scroll,
  insert-sensitive: where cursors earn their keep. Unchanged by this work.

## Spike results (proof the design holds — verified, not assumed)

Against the real `Note` model with a REBAC `get_queryset`, under alice's actor:

- **Offset group paging**: `offset:0,limit:1 → {active:2}`; `offset:1 → {draft:1}`;
  `totalCount:2`. ✅
- **No-pagination baseline**: all groups returned, scoped. ✅
- **Multi-axis** `[{UPDATED_AT,YEAR},{UPDATED_AT,MONTH}]` resolves with no
  errors (compute groups across both axes). ✅
- **REBAC scoping** rides the `get_queryset` hook under `actor_context`. ✅
- **SDL shape** (offset): `noteGroups(groupBy:[NoteGroupBySpec!]!, having:
  NoteHaving, orderBy:[NoteGroupOrder!], pagination: OffsetPaginationInput,
  weekStart, fill, fillMin, fillMax): NoteGroupedResult!`, where
  `NoteGroupedResult { results:[NoteGrouped!]!, pageInfo: OffsetPaginationInfo!,
  totalCount: Int! }`, `NoteGroupBySpec { field: NoteGroupableField!,
  granularity: Granularity }`, `NoteGroupKey { status, updatedAtYear,
  updatedAtMonth, …+Range }`, full `Granularity` enum. ✅

**Footgun documented for clients**: the selected `key { … }` fields must match
the `groupBy` axes. Grouping by `UPDATED_AT@YEAR` but selecting `key{status}`
yields `status:null` (the key field isn't in that group). Select
`key{updatedAtYear updatedAtMonth}` when grouping by those axes.

## Mandatory REBAC fact (from the spike)

The builder's `_resolve_queryset` defaults to `model._default_manager.all()`.
For a REBAC model under strict mode, **materializing that without an actor
raises `MissingActorError`**. So `get_queryset` returning a scoped queryset is
**not optional** — it is required for every REBAC-bound aggregate. This is also
the clean home for the `_apply_scope_in_place()` call (a prior review finding):
it lives in one hook, not poked from a resolver.

## Design

### Angee side (thin; mostly deletion)

1. **Notes `schema.py`** — delete the hand-rolled block and replace with one
   builder call:
   - DELETE: `NoteGroupBy` enum, `_GROUP_BY_SPECS`, `NoteGrouped`,
     `NoteAggregate`, `NotesAggregateQuery`, `_scoped_note_queryset`,
     `_grouped_from_row`, `_group_value`, `_row_count`, and the
     `compiler`/`granularity`/`operators` imports (~95 lines).
   - ADD: a `_rebac_scoped(info)` queryset hook (the only glue), and
     ```python
     note_aggregates = AggregateBuilder(
         model=Note,
         aggregate_fields=["id"],          # count is the M2 measure
         group_by_fields=["status", "is_starred", "updated_at"],
         pagination_style="offset",
         get_queryset=_rebac_scoped,
     ).build()
     ```
   - Attach `note_aggregates.group_by_field` (and `.aggregate_field` for the
     ungrouped totals) to the `public`/`console` query buckets; register the
     emitted types (`grouped_type`, `group_key_type`, `aggregate_type`,
     `grouped_result_type`) in the schema `types` bucket.

2. **Detail drill-down unchanged** — the relay `notes(filters:, order:)`
   connection is the "expand a group → paginated records" second call.

3. **Net**: angee loses ~95 lines and gains group pagination + multi-axis +
   all granularities + having + aggregate ordering, all library-owned.

### Library side

**Untouched for M2.** If implementation reveals the `get_queryset` hook cannot
cleanly carry REBAC scope (it can — proven), fix it *there*, not in angee.

## Test plan

- Example GraphQL test (`test_iam_graphql.py`): replace the current
  `note_aggregate` assertions with `noteGroups`:
  - group by STATUS, offset paginate (`limit:1` → page 0 `{ACTIVE:2}`, page 1
    `{DRAFT:1}`), assert `totalCount`.
  - multi-axis `[UPDATED_AT@YEAR, UPDATED_AT@MONTH]` returns buckets with
    `key{updatedAtYear updatedAtMonth}` populated.
  - REBAC: bob's grouped totals differ from alice's (actor-scoped).
- Keep the existing relay `notes()` pagination/filter/order tests (detail tier).
- `schema --check` regenerates SDL with the new `NoteGrouped*` types.

## Verification / DoD

```sh
uv run ruff check . --no-cache
uv run mypy src/
uv run pytest
uv run examples/notes-angee/manage.py test example.notes
# fresh e2e:
uv run examples/notes-angee/manage.py angee build
uv run examples/notes-angee/manage.py makemigrations base iam notes
uv run examples/notes-angee/manage.py migrate
uv run examples/notes-angee/manage.py rebac sync
uv run examples/notes-angee/manage.py resources load demo
uv run examples/notes-angee/manage.py schema && schema --check
```

DoD: hand-rolled aggregate deleted; `noteGroups` offset-paginated + multi-axis +
REBAC-scoped; detail tier still cursor-paginated; all gates green; SDL carries
`NoteGroupedResult`/`NoteGroupBySpec`/`NoteGroupKey`/`Granularity`.

## Open question for the architect

`aggregate_fields=["id"]` gives `count` only (the M2 measure — notes have no
numeric measure beyond count; `word_count` is a Python property, not summable).
Confirm count-only is the M2 scope, or name a measure to promote (e.g. add a
real numeric column) — deferrable to a later slice.
