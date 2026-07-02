"""Step implementation seam for workflow definitions.

Step rows store a registry key in ``step_class``. The configured class owns the
behavior selected by that key and validates the row's ``config`` before the row is
saved. Product addons register their own :class:`StepImpl` subclasses through
``ANGEE_WORKFLOW_STEP_CLASSES``; row data never stores dotted import paths.

Implementations declare ``deterministic``: deterministic implementations may be
replayed for routing, while non-deterministic activity implementations are
journaled by the runtime. Implementations may also declare ``decision_schema`` for
typed resume payloads. Suspension persists no in-process state: ``resume_state``
on the future step-run journal is the only state surviving suspension, and an
implementation must write any continuation facts there before returning a
suspended result.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any, ClassVar, Self

from django.core.exceptions import ValidationError
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from angee.base.impl import ImplBase


@dataclass(frozen=True, slots=True)
class StepResult:
    """Result returned by a workflow step implementation.

    ``done(output, outcome)`` completes the step and routes by ``outcome``.
    ``wait(until=..., event=...)`` records durable timer/event wake conditions;
    when both are supplied the runtime treats them as first-of. ``suspend()``
    pauses the step until an external resolution writes the next journal facts.
    """

    kind: str
    output: Any = None
    outcome: str = ""
    until: datetime | None = None
    event: str = ""
    resume_state: dict[str, Any] | None = None

    @classmethod
    def done(cls, output: Any = None, outcome: str = "") -> Self:
        """Return a completed step result."""

        return cls(kind="done", output=output, outcome=outcome)

    @classmethod
    def wait(
        cls,
        *,
        until: datetime | None = None,
        event: str = "",
        resume_state: dict[str, Any] | None = None,
    ) -> Self:
        """Return a durable wait result."""

        if until is None and not event:
            raise ValueError("StepResult.wait requires until, event, or both.")
        return cls(kind="wait", until=until, event=event, resume_state=resume_state)

    @classmethod
    def suspend(cls, *, resume_state: dict[str, Any] | None = None) -> Self:
        """Return a suspended step result."""

        return cls(kind="suspend", resume_state=resume_state)


class StepImpl(ImplBase):
    """Base class for registry-selected workflow step implementations."""

    deterministic: ClassVar[bool] = True
    decision_schema: ClassVar[type[Any] | None] = None

    @classmethod
    def validate_config(cls, config: Any) -> None:
        """Validate a step row's JSON config for this implementation."""

        if not isinstance(config, Mapping):
            raise ValidationError({"config": "Step config must be a JSON object."})

    def run(self, step_run: Any) -> StepResult:
        """Execute one step-run journal row."""

        raise NotImplementedError(f"{type(self).__name__}.run() is supplied by a runtime slice.")


class HandlerStep(StepImpl):
    """Abstract activity step base registered as the built-in ``handler`` key."""

    key = "handler"
    label = "Handler"
    category = "Activity"
    deterministic = False


class WaitStep(StepImpl):
    """Built-in wait step for timer/event first-of waits."""

    key = "wait"
    label = "Wait"
    category = "Control"

    @classmethod
    def validate_config(cls, config: Any) -> None:
        """Validate timer/event wait configuration."""

        super().validate_config(config)
        if "until" not in config and "event" not in config:
            raise ValidationError({"config": "Wait steps require an until timestamp, event, or both."})
        if "until" in config and _config_until(config["until"]) is None:
            raise ValidationError({"config": "Wait until must be an ISO datetime."})

    def run(self, step_run: Any) -> StepResult:
        """Return done once the timer or event condition has arrived."""

        now = getattr(step_run, "_engine_now", None) or timezone.now()
        if str(getattr(step_run.status, "value", step_run.status)) == "waiting":
            if step_run.wait_until is not None and step_run.wait_until <= now:
                return StepResult.done(output=step_run.output, outcome="timer")
            if step_run.wait_event and step_run.resume_state.get("event_received"):
                return StepResult.done(output=step_run.output, outcome=step_run.wait_event)
            return StepResult.wait(
                until=step_run.wait_until,
                event=step_run.wait_event,
                resume_state=dict(step_run.resume_state),
            )

        config = dict(step_run.step.config)
        until = _config_until(config.get("until")) if "until" in config else None
        event = str(config.get("event", "") or "")
        if until is not None and until <= now:
            return StepResult.done(output={}, outcome="timer")
        return StepResult.wait(until=until, event=event, resume_state={"config": config})


class GateStep(StepImpl):
    """Built-in gate step that suspends until Slice 4 decision rows exist."""

    key = "gate"
    label = "Gate"
    category = "Control"

    def run(self, step_run: Any) -> StepResult:
        """Suspend the step, keeping only durable resume state."""

        return StepResult.suspend(resume_state={"gate": dict(step_run.step.config)})


def _config_until(value: Any) -> datetime | None:
    """Return an aware datetime parsed from a wait config value."""

    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = parse_datetime(str(value))
    if parsed is None:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed
