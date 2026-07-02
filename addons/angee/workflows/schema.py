"""GraphQL schema contributions for the workflows addon."""

from __future__ import annotations

import strawberry_django
from django.apps import apps
from strawberry import auto
from strawberry.scalars import JSON

from angee.graphql.data import AngeeHasuraWriteBackend, hasura_model_resource, public_pk_decoder
from angee.graphql.node import AngeeNode

Workflow = apps.get_model("workflows", "Workflow")
Step = apps.get_model("workflows", "Step")
Edge = apps.get_model("workflows", "Edge")
Trigger = apps.get_model("workflows", "Trigger")


@strawberry_django.type(Workflow)
class WorkflowType(AngeeNode):
    """Admin projection of a workflow definition."""

    name: auto
    description: auto
    status: auto
    version: auto
    published_from: "WorkflowType | None"
    error_workflow: "WorkflowType | None"
    max_steps: auto
    budget: JSON
    created_at: auto
    updated_at: auto


@strawberry_django.type(Step)
class StepType(AngeeNode):
    """Admin projection of a workflow step definition."""

    workflow: WorkflowType
    key: auto
    name: auto
    step_class: auto
    config: JSON
    join_rule: auto
    is_entry: auto
    position: JSON
    created_at: auto
    updated_at: auto


@strawberry_django.type(Edge)
class EdgeType(AngeeNode):
    """Admin projection of a workflow edge definition."""

    workflow: WorkflowType
    source: StepType
    target: StepType
    condition: auto
    created_at: auto
    updated_at: auto


@strawberry_django.type(Trigger)
class TriggerType(AngeeNode):
    """Admin projection of a workflow trigger definition."""

    workflow: WorkflowType
    kind: auto
    enabled: auto
    config: JSON
    created_at: auto
    updated_at: auto


_WORKFLOW_RESOURCE = hasura_model_resource(
    WorkflowType,
    model=Workflow,
    name="workflows",
    filterable=["id", "name", "status", "version", "published_from", "error_workflow", "updated_at"],
    sortable=["name", "status", "version", "created_at", "updated_at"],
    aggregatable=["id", "version", "max_steps"],
    groupable=["status", "updated_at"],
    insertable=["name", "description", "error_workflow", "max_steps", "budget"],
    updatable=["name", "description", "error_workflow", "max_steps", "budget"],
    field_id_decode={
        "published_from": public_pk_decoder(Workflow),
        "error_workflow": public_pk_decoder(Workflow),
    },
    write_backend=AngeeHasuraWriteBackend(Workflow, public_id_fields=("error_workflow",)),
)
_STEP_RESOURCE = hasura_model_resource(
    StepType,
    model=Step,
    name="workflow_steps",
    filterable=["id", "workflow", "key", "name", "step_class", "join_rule", "is_entry", "updated_at"],
    sortable=["workflow", "key", "name", "step_class", "join_rule", "is_entry", "created_at", "updated_at"],
    aggregatable=["id"],
    groupable=["workflow", "workflow__name", "step_class", "join_rule", "is_entry", "updated_at"],
    insertable=["workflow", "key", "name", "step_class", "config", "join_rule", "is_entry", "position"],
    updatable=["key", "name", "step_class", "config", "join_rule", "is_entry", "position"],
    field_id_decode={"workflow": public_pk_decoder(Workflow)},
    write_backend=AngeeHasuraWriteBackend(Step, public_id_fields=("workflow",)),
)
_EDGE_RESOURCE = hasura_model_resource(
    EdgeType,
    model=Edge,
    name="workflow_edges",
    filterable=["id", "workflow", "source", "target", "condition", "updated_at"],
    sortable=["workflow", "source", "target", "condition", "created_at", "updated_at"],
    aggregatable=["id"],
    groupable=["workflow", "workflow__name", "condition", "updated_at"],
    insertable=["workflow", "source", "target", "condition"],
    updatable=["source", "target", "condition"],
    field_id_decode={
        "workflow": public_pk_decoder(Workflow),
        "source": public_pk_decoder(Step),
        "target": public_pk_decoder(Step),
    },
    write_backend=AngeeHasuraWriteBackend(Edge, public_id_fields=("workflow", "source", "target")),
)
_TRIGGER_RESOURCE = hasura_model_resource(
    TriggerType,
    model=Trigger,
    name="workflow_triggers",
    filterable=["id", "workflow", "kind", "enabled", "updated_at"],
    sortable=["workflow", "kind", "enabled", "created_at", "updated_at"],
    aggregatable=["id"],
    groupable=["workflow", "workflow__name", "kind", "enabled", "updated_at"],
    insertable=["workflow", "kind", "enabled", "config"],
    updatable=["kind", "enabled", "config"],
    field_id_decode={"workflow": public_pk_decoder(Workflow)},
    write_backend=AngeeHasuraWriteBackend(Trigger, public_id_fields=("workflow",)),
)

_CONSOLE_TYPES: list[object] = [
    WorkflowType,
    StepType,
    EdgeType,
    TriggerType,
    *_WORKFLOW_RESOURCE.types,
    *_STEP_RESOURCE.types,
    *_EDGE_RESOURCE.types,
    *_TRIGGER_RESOURCE.types,
]

schemas = {
    "console": {
        "query": [
            _WORKFLOW_RESOURCE.query,
            _STEP_RESOURCE.query,
            _EDGE_RESOURCE.query,
            _TRIGGER_RESOURCE.query,
        ],
        "mutation": [
            _WORKFLOW_RESOURCE.mutation,
            _STEP_RESOURCE.mutation,
            _EDGE_RESOURCE.mutation,
            _TRIGGER_RESOURCE.mutation,
        ],
        "types": _CONSOLE_TYPES,
    },
}
"""GraphQL contributions installed by the workflows addon."""
