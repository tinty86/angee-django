"""Runtime engine for workflow runs.

This module is the single owner of workflow advancement. It creates and replays
the step-run journal, evaluates join rules, routes outcomes, claims work, and
records cancellation. Step implementations run only through ``execute()``, never
inside ``advance()``.
"""

from __future__ import annotations

import traceback
from collections.abc import Iterable
from datetime import datetime
from typing import Any, cast

from django.apps import apps
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone
from procrastinate import exceptions as procrastinate_exceptions
from rebac import system_context
from rebac.actors import NoActorResolvedError, to_subject_ref

from angee.base.actors import actor_user_id
from angee.workflows.models import JoinRule, RunStatus, StepRunStatus, WorkflowStatus
from angee.workflows.steps import StepResult

RUN_TERMINAL = {RunStatus.SUCCEEDED, RunStatus.FAILED, RunStatus.CANCELED}
STEP_TERMINAL = {
    StepRunStatus.SUCCEEDED,
    StepRunStatus.FAILED,
    StepRunStatus.CANCELED,
    StepRunStatus.SKIPPED,
}
STEP_ACTIVE = {StepRunStatus.SCHEDULED, StepRunStatus.STARTED, StepRunStatus.WAITING}


def start(
    workflow: Any,
    subject: Any,
    actor: Any,
    *,
    trigger: Any = None,
    parent_step_run: Any = None,
) -> Any:
    """Start the current published version for ``workflow`` and enqueue advancement."""

    workflow_model = _model("Workflow")
    run_model = _model("WorkflowRun")
    step_run_model = _model("StepRun")
    with system_context(reason="workflows.engine.start"), transaction.atomic():
        version = workflow_model.objects.current_published_for(workflow)
        if version is None:
            raise ValidationError({"workflow": "Workflow has no published version to start."})
        if version.status != WorkflowStatus.PUBLISHED:
            raise ValidationError({"workflow": "Workflow runs must pin a published version."})

        subject_content_type, subject_object_id = _object_ref(subject)
        dedup_key = _dedup_key(trigger, subject_content_type, subject_object_id)
        owner_id = _owner_id(actor=actor, trigger=trigger, workflow=version)

        attrs = {
            "workflow": version,
            "trigger": trigger,
            "parent_step_run": parent_step_run,
            "subject_content_type": subject_content_type,
            "subject_object_id": subject_object_id,
            "created_by_id": owner_id,
            "updated_by_id": owner_id,
        }
        if dedup_key:
            run, created = run_model.objects.get_or_create(dedup_key=dedup_key, defaults=attrs)
            if not created:
                return run
        else:
            run = run_model.objects.create(**attrs)

        entries = list(version.steps.filter(is_entry=True).order_by("pk"))
        if len(entries) != 1:
            raise ValidationError({"workflow": "Workflow version must have exactly one entry step."})
        step_run_model.objects.create(
            run=run,
            step=entries[0],
            map_index=-1,
            status=StepRunStatus.SCHEDULED,
            input={},
        )
        transaction.on_commit(lambda: enqueue_advance(run.pk))
    return run


def advance(run_id: int, *, now: datetime | None = None) -> dict[str, int]:
    """Advance one workflow run under a short row lock, without running impls."""

    timestamp = now or timezone.now()
    run_model = _model("WorkflowRun")
    claimed_ids: list[int] = []

    with system_context(reason="workflows.engine.advance"), transaction.atomic():
        run = run_model.objects.select_for_update().select_related("workflow").get(pk=run_id)
        if run.status in RUN_TERMINAL:
            return {"claimed": 0}

        _activate_run_if_needed(run, timestamp=timestamp)
        _route_completed_steps(run)
        claimed_ids = _claim_due_steps(run, timestamp=timestamp)
        _update_run_status(run, timestamp=timestamp)
        for step_run_id in claimed_ids:
            transaction.on_commit(lambda step_run_id=step_run_id: enqueue_execute(step_run_id))

    return {"claimed": len(claimed_ids)}


def execute(step_run_id: int, *, now: datetime | None = None) -> dict[str, int]:
    """Run one claimed StepRun outside any advance lock and enqueue replay."""

    step_run_model = _model("StepRun")
    timestamp = now or timezone.now()
    with system_context(reason="workflows.engine.execute.load"):
        step_run = (
            step_run_model.objects.select_related("run", "step", "run__workflow").filter(pk=step_run_id).first()
        )
        if step_run is None or step_run.status in STEP_TERMINAL:
            return {"executed": 0}
        if step_run.status != StepRunStatus.STARTED or step_run.run.status in RUN_TERMINAL:
            return {"executed": 0}
        impl_class = step_run.step.resolve_impl("step_class", default="handler")
        setattr(step_run, "_engine_now", timestamp)

    result: StepResult | None = None
    error = ""
    stack = ""
    try:
        result = cast(Any, impl_class)().run(step_run)
    except Exception as exc:  # noqa: BLE001 - impl failure is journaled as a step result.
        error = str(exc)
        stack = traceback.format_exc()

    wait_until: datetime | None = None
    run_id: int | None = None
    with system_context(reason="workflows.engine.execute.persist"), transaction.atomic():
        locked = step_run_model.objects.select_for_update().select_related("run").get(pk=step_run_id)
        run_id = locked.run_id
        if locked.status != StepRunStatus.STARTED or locked.run.status in RUN_TERMINAL:
            return {"executed": 0}
        if error:
            locked.mark_failed(error=error, stacktrace=stack)
        elif result is None:
            locked.mark_failed(error="Step implementation returned no result.", stacktrace="")
        elif result.kind == "done":
            locked.mark_succeeded(output=result.output, outcome=result.outcome)
        elif result.kind == "wait":
            locked.mark_waiting(until=result.until, event=result.event, resume_state=result.resume_state)
            wait_until = result.until
        elif result.kind == "suspend":
            locked.mark_waiting(resume_state=result.resume_state or {})
        else:
            locked.mark_failed(error=f"Unknown step result kind {result.kind!r}.", stacktrace="")
        transaction.on_commit(lambda run_id=run_id: enqueue_advance(cast(int, run_id)))
        if wait_until is not None:
            transaction.on_commit(
                lambda run_id=run_id, wait_until=wait_until: enqueue_advance_at(cast(int, run_id), wait_until)
            )

    return {"executed": 1}


def cancel(run: Any) -> None:
    """Cancel a run, its durable waits, scheduled rows, and child runs."""

    run_model = _model("WorkflowRun")
    step_run_model = _model("StepRun")
    run_id = run.pk if hasattr(run, "pk") else int(run)
    child_ids: list[int] = []
    with system_context(reason="workflows.engine.cancel"), transaction.atomic():
        locked = run_model.objects.select_for_update().get(pk=run_id)
        if locked.status in RUN_TERMINAL:
            return
        child_ids = list(
            run_model.objects.filter(parent_step_run__run=locked).values_list("pk", flat=True).order_by("pk")
        )
        for step_run in step_run_model.objects.select_for_update().filter(run=locked).order_by("pk"):
            if step_run.status == StepRunStatus.SCHEDULED:
                step_run.mark_canceled()
            elif step_run.status == StepRunStatus.WAITING:
                step_run.mark_canceled()
            elif step_run.status == StepRunStatus.STARTED:
                state = dict(step_run.resume_state)
                state["cancel_requested"] = True
                step_run.resume_state = state
                step_run.error = "Cancellation requested; running worker result will be ignored."
                step_run.save(update_fields=["resume_state", "error", "updated_at"])
        locked.mark_canceled()

    for child_id in child_ids:
        cancel(child_id)


def sweep(*, now: datetime | None = None) -> dict[str, int]:
    """Advance runs whose durable wake time is due."""

    timestamp = now or timezone.now()
    run_model = _model("WorkflowRun")
    with system_context(reason="workflows.engine.sweep"):
        run_ids = list(
            run_model.objects.filter(wake_at__lte=timestamp)
            .filter(status__in=[RunStatus.RUNNING, RunStatus.WAITING])
            .order_by("pk")
            .values_list("pk", flat=True)
        )
    for run_id in run_ids:
        advance(run_id, now=timestamp)
    return {"runs": len(run_ids)}


def enqueue_advance(run_id: int) -> None:
    """Enqueue a deduped advance job after the current transaction commits."""

    def defer() -> None:
        # The task wrapper imports this module to call the engine; import here to
        # keep that adapter cycle out of app loading.
        from angee.workflows.tasks import advance_workflow_run

        try:
            advance_workflow_run.configure(queueing_lock=_advance_lock(run_id)).defer(run_id=run_id)
        except procrastinate_exceptions.AlreadyEnqueued:
            return

    transaction.on_commit(defer)


def enqueue_advance_at(run_id: int, when: datetime) -> None:
    """Enqueue a deferred advance job for a durable timer wake."""

    def defer() -> None:
        from angee.workflows.tasks import advance_workflow_run

        try:
            advance_workflow_run.configure(
                lock=_advance_lock(run_id),
                queueing_lock=f"{_advance_lock(run_id)}:wake:{when.isoformat()}",
                schedule_at=when,
            ).defer(run_id=run_id)
        except procrastinate_exceptions.AlreadyEnqueued:
            return

    transaction.on_commit(defer)


def enqueue_execute(step_run_id: int) -> None:
    """Enqueue one step execution job after the current transaction commits."""

    def defer() -> None:
        from angee.workflows.tasks import execute_workflow_step

        try:
            execute_workflow_step.configure(queueing_lock=f"workflows.execute:{step_run_id}").defer(
                step_run_id=step_run_id
            )
        except procrastinate_exceptions.AlreadyEnqueued:
            return

    transaction.on_commit(defer)


def _model(name: str) -> type[Any]:
    """Return a concrete workflows model from the Django app registry."""

    return apps.get_model("workflows", name)


def _activate_run_if_needed(run: Any, *, timestamp: datetime) -> None:
    if run.status == RunStatus.PENDING:
        run.mark_running()
    elif run.status == RunStatus.WAITING and _has_due_wait(run, timestamp=timestamp):
        run.resume()


def _has_due_wait(run: Any, *, timestamp: datetime) -> bool:
    return run.step_runs.filter(
        status=StepRunStatus.WAITING,
        wait_until__isnull=False,
        wait_until__lte=timestamp,
    ).exists()


def _route_completed_steps(run: Any) -> None:
    for step_run in _terminal_step_runs(run):
        if step_run.step_id is None:
            continue
        if step_run.status == StepRunStatus.SUCCEEDED:
            _route_success(run, step_run)
        elif step_run.status == StepRunStatus.SKIPPED:
            _route_skip(run, step_run)
        elif step_run.status in {StepRunStatus.FAILED, StepRunStatus.CANCELED}:
            _route_done(run, step_run)


def _terminal_step_runs(run: Any) -> Iterable[Any]:
    return (
        run.step_runs.select_related("step")
        .filter(status__in=list(STEP_TERMINAL))
        .filter(step__isnull=False)
        .order_by("pk")
    )


def _route_success(run: Any, step_run: Any) -> None:
    outgoing = list(step_run.step.outgoing_edges.select_related("target").order_by("pk"))
    for edge in outgoing:
        if edge.condition and edge.condition != step_run.outcome:
            _ensure_skipped(run, edge.target, previous=[step_run])
        else:
            _maybe_schedule_target(run, edge.target)


def _route_skip(run: Any, step_run: Any) -> None:
    for edge in step_run.step.outgoing_edges.select_related("target").order_by("pk"):
        if edge.target.join_rule == JoinRule.ALL_SUCCESS:
            _ensure_skipped(run, edge.target, previous=[step_run])
        else:
            _maybe_schedule_target(run, edge.target)


def _route_done(run: Any, step_run: Any) -> None:
    for edge in step_run.step.outgoing_edges.select_related("target").filter(condition="").order_by("pk"):
        _maybe_schedule_target(run, edge.target)


def _maybe_schedule_target(run: Any, target: Any) -> Any | None:
    step_run_model = _model("StepRun")
    existing = step_run_model.objects.filter(run=run, step=target, map_index=-1).first()
    if existing is not None:
        return existing
    upstream = _upstream_rows(run, target)
    decision = _join_decision(target.join_rule, upstream)
    previous = [row for row in upstream if row is not None]
    if decision == "skip":
        return _ensure_skipped(run, target, previous=previous)
    if decision != "run":
        return None
    step_run = step_run_model.objects.create(
        run=run,
        step=target,
        map_index=-1,
        status=StepRunStatus.SCHEDULED,
        input=_input_from_previous(previous),
    )
    step_run.previous.set(previous)
    return step_run


def _ensure_skipped(run: Any, step: Any, *, previous: list[Any]) -> Any:
    step_run_model = _model("StepRun")
    step_run = step_run_model.objects.filter(run=run, step=step, map_index=-1).first()
    if step_run is None:
        step_run = step_run_model.objects.create(
            run=run,
            step=step,
            map_index=-1,
            status=StepRunStatus.SKIPPED,
            input=_input_from_previous(previous),
        )
        step_run.previous.set(previous)
    elif step_run.status in {StepRunStatus.SCHEDULED, StepRunStatus.WAITING}:
        step_run.mark_skipped()
    else:
        return step_run

    for edge in step.outgoing_edges.select_related("target").order_by("pk"):
        if edge.target.join_rule == JoinRule.ALL_SUCCESS:
            _ensure_skipped(run, edge.target, previous=[step_run])
        else:
            _maybe_schedule_target(run, edge.target)
    return step_run


def _upstream_rows(run: Any, target: Any) -> list[Any | None]:
    step_run_model = _model("StepRun")
    rows: list[Any | None] = []
    for edge in target.incoming_edges.select_related("source").order_by("pk"):
        rows.append(step_run_model.objects.filter(run=run, step=edge.source, map_index=-1).first())
    return rows


def _join_decision(rule: Any, upstream: list[Any | None]) -> str:
    statuses = [row.status if row is not None else None for row in upstream]
    if not statuses:
        return "run"

    terminal = [status in STEP_TERMINAL for status in statuses]
    has_missing_or_active = any(status is None or status not in STEP_TERMINAL for status in statuses)
    has_success = any(status == StepRunStatus.SUCCEEDED for status in statuses)
    has_done = any(status in STEP_TERMINAL for status in statuses)
    has_failed = any(status in {StepRunStatus.FAILED, StepRunStatus.CANCELED} for status in statuses)

    if rule == JoinRule.ALL_SUCCESS:
        if all(status == StepRunStatus.SUCCEEDED for status in statuses):
            return "run"
        if any(status in STEP_TERMINAL and status != StepRunStatus.SUCCEEDED for status in statuses):
            return "skip"
        return "wait"
    if rule == JoinRule.ONE_SUCCESS:
        if has_success:
            return "run"
        return "wait" if has_missing_or_active else "none"
    if rule == JoinRule.ONE_DONE:
        return "run" if has_done else "wait"
    if rule == JoinRule.ALL_DONE:
        return "run" if all(terminal) else "wait"
    if rule == JoinRule.NONE_FAILED:
        if has_failed:
            return "none"
        return "run" if not has_missing_or_active else "wait"
    if rule == JoinRule.NONE_FAILED_MIN_ONE_SUCCESS:
        if has_failed:
            return "none"
        if has_missing_or_active:
            return "wait"
        return "run" if has_success else "none"
    if rule == JoinRule.ALWAYS:
        return "run" if not has_missing_or_active else "wait"
    return "wait"


def _claim_due_steps(run: Any, *, timestamp: datetime) -> list[int]:
    due = list(
        run.step_runs.select_for_update()
        .filter(
            models.Q(status=StepRunStatus.SCHEDULED)
            | models.Q(status=StepRunStatus.WAITING, wait_until__isnull=False, wait_until__lte=timestamp)
        )
        .order_by("pk")
    )
    if not due:
        return []
    if run.steps_taken + len(due) > run.workflow.max_steps:
        run.mark_failed(f"Workflow exceeded max_steps={run.workflow.max_steps}.")
        return []

    claimed: list[int] = []
    for step_run in due:
        step_run.mark_started(heartbeat_at=timestamp)
        claimed.append(step_run.pk)
    run.steps_taken += len(claimed)
    run.save(update_fields=["steps_taken", "updated_at"])
    return claimed


def _update_run_status(run: Any, *, timestamp: datetime) -> None:
    if run.status in RUN_TERMINAL:
        return
    active_without_wait = run.step_runs.filter(status__in=[StepRunStatus.SCHEDULED, StepRunStatus.STARTED]).exists()
    if active_without_wait:
        if run.status == RunStatus.PENDING:
            run.mark_running()
        elif run.status == RunStatus.WAITING:
            run.resume()
        if run.wake_at is not None:
            run.wake_at = None
            run.save(update_fields=["wake_at", "updated_at"])
        return

    waiting_rows = run.step_runs.filter(status=StepRunStatus.WAITING)
    if waiting_rows.exists():
        wake_at = (
            waiting_rows.filter(wait_until__isnull=False)
            .order_by("wait_until")
            .values_list("wait_until", flat=True)
            .first()
        )
        if run.status == RunStatus.RUNNING:
            run.mark_waiting(wake_at=wake_at)
        elif run.status == RunStatus.WAITING and run.wake_at != wake_at:
            run.wake_at = wake_at
            run.save(update_fields=["wake_at", "updated_at"])
        return

    failed = run.step_runs.filter(status__in=[StepRunStatus.FAILED, StepRunStatus.CANCELED]).order_by("pk").first()
    if failed is not None:
        if run.status == RunStatus.PENDING:
            run.mark_running()
        run.mark_failed(failed.error or f"Step {failed.pk} ended as {failed.status}.")
        return

    if run.step_runs.exists():
        if run.status == RunStatus.PENDING:
            run.mark_running()
        run.mark_succeeded()
        return

    if run.status == RunStatus.RUNNING and run.wake_at is not None and run.wake_at <= timestamp:
        run.wake_at = None
        run.save(update_fields=["wake_at", "updated_at"])


def _input_from_previous(previous: list[Any]) -> Any:
    if not previous:
        return {}
    if len(previous) == 1:
        return previous[0].output
    return {_step_key(row): row.output for row in previous}


def _step_key(step_run: Any) -> str:
    if step_run.step_id is not None:
        return str(step_run.step.key)
    return step_run.system_kind or str(step_run.pk)


def _object_ref(value: Any) -> tuple[Any | None, Any | None]:
    if value is None:
        return None, None
    content_type = ContentType.objects.get_for_model(value, for_concrete_model=False)
    return content_type, value.pk


def _dedup_key(trigger: Any, content_type: Any | None, object_id: Any | None) -> str:
    if trigger is None:
        return ""
    subject = "none" if content_type is None or object_id is None else f"{content_type.pk}:{object_id}"
    return f"trigger:{trigger.pk}:subject:{subject}"


def _owner_id(*, actor: Any, trigger: Any, workflow: Any) -> Any | None:
    if actor is not None:
        try:
            user_id = actor_user_id(to_subject_ref(actor))
        except NoActorResolvedError:
            user_id = None
        if user_id is not None:
            return user_id
    if trigger is not None and getattr(trigger, "created_by_id", None) is not None:
        return trigger.created_by_id
    lineage = getattr(workflow, "published_from", None)
    if lineage is not None and getattr(lineage, "created_by_id", None) is not None:
        return lineage.created_by_id
    return getattr(workflow, "created_by_id", None)


def _advance_lock(run_id: int) -> str:
    return f"workflows.advance:{run_id}"
