"""Expose curated GraphQL operations as MCP tools, scoped to the request actor.

The reuse seam for the MCP tool layer: instead of re-deriving CRUD, projection, and
permission gating per model, an MCP tool runs the *same* GraphQL operation a browser
would, under the agent's REBAC actor — so strawberry's own ``permission_classes`` and
``RebacManager`` scoping do the authorization (see ``.agents/plans/mcp-over-graphql.md``).

An addon declares a :class:`GraphQLTool` per operation and calls :func:`register`; the
compiler introspects the named schema bucket (graphql-core) to derive the tool's input
schema, response projection, and operation document, then registers a FastMCP tool whose
:meth:`_CompiledTool.run` executes the operation through :func:`execute_under_actor`.

Boundary conventions (the agent surface differs from the GraphQL wire):
- ids are the public ``sqid``; the GlobalID's node id *is* the sqid, so the boundary is a
  pure ``relay`` base64 encode/decode (a GraphQL ``id`` arg/field is exposed as ``sqid``).
- field names are ``snake_case`` for the agent, ``camelCase`` on the wire.
- a single input object (``createNote(data:)``) is flattened to top-level tool args.
- an offset-paginated list exposes ``limit`` → ``pagination.limit`` and projects ``results``.
"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from fastmcp.tools.tool import Tool, ToolResult
from graphql import (
    GraphQLEnumType,
    GraphQLInputObjectType,
    GraphQLList,
    GraphQLNonNull,
    GraphQLScalarType,
    Undefined,
)
from strawberry.relay import from_base64, to_base64

from angee.graphql.schema import GraphQLSchemas
from mcp.types import ToolAnnotations

_SCALAR_JSON = {
    "Int": "integer",
    "Float": "number",
    "Boolean": "boolean",
    "ID": "string",
    "String": "string",
    "DateTime": "string",
}
"""GraphQL scalar name → JSON Schema ``type``. ``JSON`` maps to an unconstrained schema."""


async def execute_under_actor(schema: str, document: str, variables: dict[str, Any] | None = None) -> dict[str, Any]:
    """Execute ``document`` against the named schema bucket under the ambient actor.

    Returns the operation's ``data``. Raises the first GraphQL error so the MCP layer
    surfaces it as a tool error rather than returning a partial result. The actor is
    whatever ``rebac.current_actor()`` holds — set per call by
    :class:`angee.mcp.middleware.ActorMiddleware`; the schema's ``RebacExtension`` opens
    its own scopes and pins every queryset to that actor, so no Django request is needed.
    """

    built = GraphQLSchemas.from_discovery().build(schema)
    result = await built.execute(
        document,
        variable_values=dict(variables or {}),
        context_value=SimpleNamespace(request=None),
    )
    if result.errors:
        raise result.errors[0]
    return dict(result.data or {})


@dataclass(frozen=True)
class GraphQLTool:
    """Declaration of one MCP tool backed by a GraphQL operation.

    ``operation`` is the root field name in the ``schema`` bucket; ``name`` is the MCP
    tool name. ``fields`` is the response projection in snake_case (``sqid`` selects the
    node's GlobalID and decodes it). The compiler derives the input schema and document
    from introspection; the hints below name the one input arg the tool drives:
    ``flatten`` lifts an input object's fields to top-level args, ``id_arg`` exposes a
    scalar GraphQL id arg as ``sqid``, ``limit_arg`` maps a top-level int to
    ``pagination.limit`` for an offset-paginated list.
    """

    operation: str
    name: str
    fields: tuple[str, ...]
    description: str
    schema: str = "public"
    flatten: str | None = None
    id_arg: str | None = None
    limit_arg: str | None = None


def register_graphql_tools(server: Any, specs: list[GraphQLTool]) -> None:
    """Compile each spec against its schema bucket and add it to the FastMCP server."""

    for spec in specs:
        server.add_tool(_compile(spec))


class _CompiledTool(Tool):
    """A FastMCP tool that runs a GraphQL operation under the request actor.

    Carries the introspection-derived execution plan as data (no closures) so the
    subclass stays a plain pydantic model; :meth:`run` interprets it.
    """

    schema_name: str
    document: str
    payload_field: str
    node_type: str
    is_list: bool
    leaves: list[tuple[str, str, bool]]
    flatten_arg: str | None = None
    id_arg: str | None = None
    limit_arg: str | None = None

    async def run(self, arguments: dict[str, Any]) -> ToolResult:
        """Execute the operation and return the projected payload as structured content."""

        data = await execute_under_actor(self.schema_name, self.document, self._variables(arguments))
        payload = data.get(self.payload_field)
        if self.is_list:
            rows = (payload or {}).get("results") or []
            return ToolResult(structured_content={"result": [self._project(row) for row in rows]})
        if payload is None:
            raise ValueError(f"{self.name}: no matching record.")
        return ToolResult(structured_content=self._project(payload))

    def _variables(self, arguments: dict[str, Any]) -> dict[str, Any]:
        """Map agent args to GraphQL variables: limit→pagination, sqid→GlobalID, flatten."""

        args = dict(arguments)
        variables: dict[str, Any] = {}
        if self.limit_arg and self.limit_arg in args:
            variables["pagination"] = {"limit": args.pop(self.limit_arg)}
        if self.id_arg and "sqid" in args:
            variables[self.id_arg] = to_base64(self.node_type, str(args.pop("sqid")))
        if self.flatten_arg:
            obj: dict[str, Any] = {}
            if "sqid" in args:
                obj["id"] = to_base64(self.node_type, str(args.pop("sqid")))
            for key, value in args.items():
                obj[_camel(key)] = value
            variables[self.flatten_arg] = obj
        return variables

    def _project(self, row: dict[str, Any]) -> dict[str, Any]:
        """Project one GraphQL node into the agent shape (snake keys, GlobalID→sqid)."""

        out: dict[str, Any] = {}
        for key, wire, is_id in self.leaves:
            value = row.get(wire)
            if is_id and isinstance(value, str):
                value = from_base64(value)[1]
            out[key] = value
        return out


def _compile(spec: GraphQLTool) -> _CompiledTool:
    """Introspect the schema bucket and build the runnable tool for ``spec``."""

    gc = GraphQLSchemas.from_discovery().build(spec.schema)._schema
    op_type, field = _root_field(gc, spec.operation)
    node, is_list = _return_node(field.type)
    leaves = [("sqid", "id", True) if name == "sqid" else (name, _camel(name), False) for name in spec.fields]
    parameters = _input_schema(field, spec)
    document = _document(op_type, spec, field, leaves, is_list)
    return _CompiledTool(
        name=spec.name,
        description=spec.description,
        parameters=parameters,
        output_schema=_output_schema(node, leaves, is_list),
        annotations=ToolAnnotations(readOnlyHint=(op_type == "query")),
        schema_name=spec.schema,
        document=document,
        payload_field=spec.operation,
        node_type=node.name,
        is_list=is_list,
        leaves=leaves,
        flatten_arg=spec.flatten,
        id_arg=spec.id_arg,
        limit_arg=spec.limit_arg,
    )


def _root_field(gc: Any, operation: str) -> tuple[str, Any]:
    """Return ``("query"|"mutation", GraphQLField)`` for the named root operation."""

    if gc.query_type and operation in gc.query_type.fields:
        return "query", gc.query_type.fields[operation]
    if gc.mutation_type and operation in gc.mutation_type.fields:
        return "mutation", gc.mutation_type.fields[operation]
    raise ValueError(f"Operation {operation!r} is not a root field of the schema.")


def _return_node(rtype: Any) -> tuple[Any, bool]:
    """Unwrap the return type to its node type, flagging an offset-paginated list."""

    node = rtype.of_type if isinstance(rtype, GraphQLNonNull) else rtype
    fields = getattr(node, "fields", {})
    if "results" in fields:
        element = fields["results"].type
        while isinstance(element, GraphQLNonNull | GraphQLList):
            element = element.of_type
        return element, True
    return node, False


def _input_schema(field: Any, spec: GraphQLTool) -> dict[str, Any]:
    """Build the tool's JSON input schema from the one arg the spec drives."""

    properties: dict[str, Any] = {}
    required: list[str] = []
    if spec.limit_arg:
        properties[spec.limit_arg] = {"type": "integer", "description": "Maximum rows to return."}
    if spec.id_arg:
        properties["sqid"] = {"type": "string", "description": "Public id of the target record."}
        required.append("sqid")
    if spec.flatten:
        for name, input_field in _unwrap(field.args[spec.flatten].type).fields.items():
            if name == "id":
                properties["sqid"] = {"type": "string", "description": "Public id of the target record."}
                required.append("sqid")
                continue
            schema, non_null = _json_type(input_field.type)
            properties[_snake(name)] = schema
            if non_null and input_field.default_value is Undefined:
                required.append(_snake(name))
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


def _document(op_type: str, spec: GraphQLTool, field: Any, leaves: list[tuple[str, str, bool]], is_list: bool) -> str:
    """Render the GraphQL operation document with variable defs and the selection set."""

    used = [arg for arg in (("pagination" if spec.limit_arg else None), spec.id_arg, spec.flatten) if arg]
    var_defs = ", ".join(f"${arg}: {field.args[arg].type}" for arg in used)
    call_args = ", ".join(f"{arg}: ${arg}" for arg in used)
    selection = " ".join(wire for _key, wire, _is_id in leaves)
    body = f"results {{ {selection} }}" if is_list else selection
    call = f"{spec.operation}({call_args})" if call_args else spec.operation
    header = f"({var_defs})" if var_defs else ""
    return f"{op_type} {header} {{ {call} {{ {body} }} }}"


def _output_schema(node: Any, leaves: list[tuple[str, str, bool]], is_list: bool) -> dict[str, Any]:
    """Build the advertised output schema (an object; a list wraps under ``result``)."""

    properties: dict[str, Any] = {}
    for key, wire, is_id in leaves:
        if is_id:
            properties[key] = {"type": "string"}
        else:
            properties[key], _ = _json_type(node.fields[wire].type)
    row_schema = {"type": "object", "properties": properties}
    if is_list:
        return {"type": "object", "properties": {"result": {"type": "array", "items": row_schema}}}
    return row_schema


def _json_type(gql_type: Any) -> tuple[dict[str, Any], bool]:
    """Map a GraphQL input/output type to ``(JSON Schema, is_non_null)``."""

    if isinstance(gql_type, GraphQLNonNull):
        schema, _ = _json_type(gql_type.of_type)
        return schema, True
    if isinstance(gql_type, GraphQLList):
        item, _ = _json_type(gql_type.of_type)
        return {"type": "array", "items": item}, False
    if isinstance(gql_type, GraphQLEnumType):
        return {"type": "string", "enum": list(gql_type.values)}, False
    if isinstance(gql_type, GraphQLScalarType):
        name = _SCALAR_JSON.get(gql_type.name)
        return ({"type": name} if name else {}), False
    if isinstance(gql_type, GraphQLInputObjectType):
        return {"type": "object"}, False
    return {}, False


def _unwrap(gql_type: Any) -> Any:
    """Strip NonNull/List wrappers to the named type."""

    while isinstance(gql_type, GraphQLNonNull | GraphQLList):
        gql_type = gql_type.of_type
    return gql_type


def _camel(name: str) -> str:
    """``snake_case`` → ``camelCase`` (the GraphQL wire name)."""

    head, *tail = name.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _snake(name: str) -> str:
    """``camelCase`` → ``snake_case`` (the agent-facing name)."""

    return "".join(f"_{ch.lower()}" if ch.isupper() else ch for ch in name)
