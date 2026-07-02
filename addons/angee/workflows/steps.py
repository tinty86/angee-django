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

    @classmethod
    def done(cls, output: Any = None, outcome: str = "") -> Self:
        """Return a completed step result."""

        return cls(kind="done", output=output, outcome=outcome)

    @classmethod
    def wait(cls, *, until: datetime | None = None, event: str = "") -> Self:
        """Return a durable wait result."""

        if until is None and not event:
            raise ValueError("StepResult.wait requires until, event, or both.")
        return cls(kind="wait", until=until, event=event)

    @classmethod
    def suspend(cls) -> Self:
        """Return a suspended step result."""

        return cls(kind="suspend")


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
    """Built-in wait step placeholder for timer/event first-of waits."""

    key = "wait"
    label = "Wait"
    category = "Control"


class GateStep(StepImpl):
    """Built-in gate step placeholder for future decision slots."""

    key = "gate"
    label = "Gate"
    category = "Control"
