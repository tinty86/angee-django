"""Source models for workflow definitions.

The workflows addon owns graph definitions as data: a draft workflow lineage
head carries editable steps, edges, and triggers, while ``publish()`` copies that
draft into an immutable version. Step behavior remains in registry-selected
``StepImpl`` classes, so row data names keys and config, not Python callables.
Future runtime subject/artifact references use Django contenttypes-backed object
references; public ids stay at the transport boundary.
"""

from __future__ import annotations

import copy
from typing import Any, Self, cast

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import models, transaction

from angee.base.fields import ImplClassField, StateField
from angee.base.impl import ImplDefaultsMixin
from angee.base.mixins import AuditMixin
from angee.base.models import AngeeDataModel, AngeeManager
from angee.base.transitions import StateTransitions, transition
from angee.workflows.steps import StepImpl


class WorkflowStatus(models.TextChoices):
    """Publication lifecycle for a workflow definition row."""

    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"


class JoinRule(models.TextChoices):
    """How a step with multiple incoming edges activates over upstream siblings."""

    ALL_SUCCESS = "all_success", "All success"
    ONE_SUCCESS = "one_success", "One success"
    ONE_DONE = "one_done", "One done"
    ALL_DONE = "all_done", "All done"
    NONE_FAILED = "none_failed", "None failed"
    NONE_FAILED_MIN_ONE_SUCCESS = "none_failed_min_one_success", "None failed, at least one success"
    ALWAYS = "always", "Always"


class TriggerKind(models.TextChoices):
    """How a workflow lineage is started."""

    MANUAL = "manual", "Manual"
    EVENT = "event", "Event"
    SCHEDULE = "schedule", "Schedule"


def _save_workflow_status(instance: models.Model, source: Any, target: Any) -> None:
    """Persist a transition-owned workflow status change."""

    del source, target
    cast("Workflow", instance)._save_status_change()


class WorkflowManager(AngeeManager):
    """Manager owning workflow lineage lookups."""

    def current_published_for(self, workflow: Any) -> Any | None:
        """Return the latest published version for ``workflow``'s lineage."""

        head = workflow if getattr(workflow, "published_from_id", None) is None else workflow.published_from
        return (
            self.filter(status=WorkflowStatus.PUBLISHED)
            .filter(models.Q(pk=head.pk) | models.Q(published_from=head))
            .order_by("-version", "-pk")
            .first()
        )


class Workflow(AuditMixin, AngeeDataModel):
    """Editable workflow lineage head or immutable published workflow version."""

    runtime = True

    sqid_prefix = "wfl_"
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = StateField(choices_enum=WorkflowStatus, default=WorkflowStatus.DRAFT)
    version = models.PositiveIntegerField(default=0)
    published_from = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="published_versions",
    )
    error_workflow = models.ForeignKey(
        "workflows.Workflow",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="error_for_workflows",
    )
    max_steps = models.PositiveIntegerField(default=1000)
    budget = models.JSONField(default=dict, blank=True)

    status_transitions = StateTransitions(
        status,
        {
            WorkflowStatus.DRAFT: [WorkflowStatus.PUBLISHED],
            WorkflowStatus.PUBLISHED: [WorkflowStatus.ARCHIVED],
        },
    )

    objects = WorkflowManager()

    class Meta:
        """Django model options for workflow definitions."""

        abstract = True
        ordering = ("name", "version")
        rebac_resource_type = "workflows/workflow"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return the workflow's display label."""

        return self.name

    @transition(status, source=WorkflowStatus.DRAFT, target=WorkflowStatus.PUBLISHED, on_success=_save_workflow_status)
    def mark_published(self) -> None:
        """Mark this copied version as published."""

    @transition(
        status,
        source=WorkflowStatus.PUBLISHED,
        target=WorkflowStatus.ARCHIVED,
        on_success=_save_workflow_status,
    )
    def archive(self) -> None:
        """Archive a published workflow version."""

    def clean(self) -> None:
        """Validate lineage-owned workflow links."""

        super().clean()
        if self.error_workflow_id is not None and self.error_workflow.published_from_id is not None:
            raise ValidationError({"error_workflow": "Error workflow must point to a workflow lineage head."})

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the workflow after enforcing immutability and model validation."""

        self._raise_if_immutable_save()
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        """Delete only mutable workflow rows."""

        self._raise_if_immutable_save()
        return super().delete(*args, **kwargs)

    def publish(self) -> Self:
        """Copy this draft lineage head into an immutable published version."""

        self.full_clean()
        if self.published_from_id is not None:
            raise ValidationError({"published_from": "Only a workflow lineage head can be published."})
        if self.status != WorkflowStatus.DRAFT:
            raise ValidationError({"status": "Only draft workflows can be published."})
        self._validate_publishable()

        with transaction.atomic():
            draft = type(self).objects.select_for_update().get(pk=self.pk)
            draft._validate_publishable()
            version = draft._next_published_version()
            published = type(self)(
                name=draft.name,
                description=draft.description,
                status=WorkflowStatus.DRAFT,
                version=version,
                published_from=draft,
                error_workflow=draft.error_workflow,
                max_steps=draft.max_steps,
                budget=copy.deepcopy(draft.budget),
            )
            published.save()
            draft._copy_definition_to(published)
            published.mark_published()
            return cast(Self, published)

    def _next_published_version(self) -> int:
        """Return the next immutable version number for this lineage head."""

        current = (
            type(self).objects.filter(published_from=self).aggregate(max_version=models.Max("version"))["max_version"]
            or 0
        )
        return int(current) + 1

    def _copy_definition_to(self, published: Workflow) -> None:
        """Copy this draft's steps and edges to ``published``."""

        step_model = self.steps.model
        edge_model = self.edges.model
        step_map: dict[int, Any] = {}
        for step in self.steps.order_by("pk"):
            copied = step_model(
                workflow=published,
                key=step.key,
                name=step.name,
                step_class=step.step_class,
                config=copy.deepcopy(step.config),
                join_rule=step.join_rule,
                is_entry=step.is_entry,
                position=copy.deepcopy(step.position),
            )
            copied.save()
            step_map[step.pk] = copied
        for edge in self.edges.select_related("source", "target").order_by("pk"):
            edge_model(
                workflow=published,
                source=step_map[edge.source_id],
                target=step_map[edge.target_id],
                condition=edge.condition,
            ).save()

    def _validate_publishable(self) -> None:
        """Require exactly one entry step before publishing."""

        entry_count = self.steps.filter(is_entry=True).count()
        if entry_count != 1:
            raise ValidationError({"steps": "A workflow must have exactly one entry step before publishing."})

    def _save_status_change(self) -> None:
        """Save a transition-owned status change, including immutable rows."""

        self._allow_immutable_status_save = True
        try:
            self.save(update_fields=["status"])
        finally:
            del self._allow_immutable_status_save

    def _raise_if_immutable_save(self) -> None:
        """Reject writes to persisted published or archived workflow definitions."""

        if self._state.adding or getattr(self, "_allow_immutable_status_save", False):
            return
        try:
            persisted = type(self)._base_manager.only("status").get(pk=self.pk)
        except ObjectDoesNotExist:
            return
        if persisted.status in {WorkflowStatus.PUBLISHED, WorkflowStatus.ARCHIVED}:
            raise ValidationError("Published workflow versions are immutable.")


class Step(ImplDefaultsMixin, AuditMixin, AngeeDataModel):
    """One node in a workflow definition graph."""

    runtime = True

    sqid_prefix = "wfs_"
    workflow = models.ForeignKey("workflows.Workflow", on_delete=models.CASCADE, related_name="steps")
    key = models.SlugField(max_length=100)
    name = models.CharField(max_length=200)
    step_class = ImplClassField(
        base_class=StepImpl,
        registry_setting="ANGEE_WORKFLOW_STEP_CLASSES",
        default="handler",
    )
    config = models.JSONField(default=dict, blank=True)
    join_rule = StateField(choices_enum=JoinRule, default=JoinRule.ALL_SUCCESS)
    is_entry = models.BooleanField(default=False)
    position = models.JSONField(default=dict, blank=True)

    objects = AngeeManager()

    class Meta:
        """Django model options for workflow steps."""

        abstract = True
        ordering = ("workflow", "key")
        rebac_resource_type = "workflows/step"
        rebac_id_attr = "sqid"
        constraints = (models.UniqueConstraint(fields=("workflow", "key"), name="uniq_workflows_step_key"),)

    def __str__(self) -> str:
        """Return the step's display label."""

        return self.name or self.key

    def clean(self) -> None:
        """Validate the step implementation key and config."""

        super().clean()
        try:
            impl = cast(type[StepImpl], self.resolve_impl("step_class", default="handler"))
            impl.validate_config(self.config)
        except ValidationError:
            raise
        except Exception as error:
            raise ValidationError({"step_class": "Unknown workflow step class."}) from error

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the step after enforcing parent immutability and validation."""

        self._raise_if_workflow_immutable()
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        """Delete only steps belonging to mutable workflow rows."""

        self._raise_if_workflow_immutable()
        return super().delete(*args, **kwargs)

    def _raise_if_workflow_immutable(self) -> None:
        """Reject writes when this step belongs to an immutable workflow version."""

        if self.workflow_id is None:
            return
        status = type(self.workflow)._base_manager.only("status").get(pk=self.workflow_id).status
        if status in {WorkflowStatus.PUBLISHED, WorkflowStatus.ARCHIVED}:
            raise ValidationError("Published workflow versions are immutable.")


class Edge(AuditMixin, AngeeDataModel):
    """Directed edge between two workflow steps."""

    runtime = True

    sqid_prefix = "wfe_"
    workflow = models.ForeignKey("workflows.Workflow", on_delete=models.CASCADE, related_name="edges")
    source = models.ForeignKey("workflows.Step", on_delete=models.CASCADE, related_name="outgoing_edges")
    target = models.ForeignKey("workflows.Step", on_delete=models.CASCADE, related_name="incoming_edges")
    condition = models.SlugField(max_length=100, blank=True, default="")

    objects = AngeeManager()

    class Meta:
        """Django model options for workflow edges."""

        abstract = True
        ordering = ("workflow", "source", "target", "condition")
        rebac_resource_type = "workflows/edge"
        rebac_id_attr = "sqid"
        constraints = (
            models.UniqueConstraint(fields=("source", "target", "condition"), name="uniq_workflows_edge_condition"),
        )

    def __str__(self) -> str:
        """Return a compact edge label."""

        return f"{self.source_id}->{self.target_id}:{self.condition}"

    def clean(self) -> None:
        """Validate that an edge is fully contained in one workflow."""

        super().clean()
        errors: dict[str, str] = {}
        if self.workflow_id is not None and self.source_id is not None and self.source.workflow_id != self.workflow_id:
            errors["source"] = "Edge source must belong to the same workflow."
        if self.workflow_id is not None and self.target_id is not None and self.target.workflow_id != self.workflow_id:
            errors["target"] = "Edge target must belong to the same workflow."
        if errors:
            raise ValidationError(errors)

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the edge after enforcing parent immutability and validation."""

        self._raise_if_workflow_immutable()
        self.full_clean()
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        """Delete only edges belonging to mutable workflow rows."""

        self._raise_if_workflow_immutable()
        return super().delete(*args, **kwargs)

    def _raise_if_workflow_immutable(self) -> None:
        """Reject writes when this edge belongs to an immutable workflow version."""

        if self.workflow_id is None:
            return
        status = type(self.workflow)._base_manager.only("status").get(pk=self.workflow_id).status
        if status in {WorkflowStatus.PUBLISHED, WorkflowStatus.ARCHIVED}:
            raise ValidationError("Published workflow versions are immutable.")


class Trigger(AuditMixin, AngeeDataModel):
    """Start rule attached to a workflow lineage head."""

    runtime = True

    sqid_prefix = "wft_"
    workflow = models.ForeignKey("workflows.Workflow", on_delete=models.CASCADE, related_name="triggers")
    kind = StateField(choices_enum=TriggerKind, default=TriggerKind.MANUAL)
    enabled = models.BooleanField(default=False)
    config = models.JSONField(default=dict, blank=True)

    objects = AngeeManager()

    class Meta:
        """Django model options for workflow triggers."""

        abstract = True
        ordering = ("workflow", "kind", "created_at")
        rebac_resource_type = "workflows/trigger"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return the trigger's display label."""

        return f"{self.workflow_id}:{self.kind}"

    def clean(self) -> None:
        """Validate that triggers attach to lineage heads."""

        super().clean()
        if self.workflow_id is not None and self.workflow.published_from_id is not None:
            raise ValidationError({"workflow": "Triggers attach only to workflow lineage heads."})

    def save(self, *args: Any, **kwargs: Any) -> None:
        """Persist the trigger after model validation."""

        self.full_clean()
        super().save(*args, **kwargs)
