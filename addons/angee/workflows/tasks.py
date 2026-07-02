"""Procrastinate task wrappers for the workflow engine."""

from __future__ import annotations

from procrastinate import RetryStrategy
from procrastinate.contrib.django import app


@app.task(name="workflows.advance", retry=RetryStrategy(max_attempts=5, exponential_wait=15))
def advance_workflow_run(run_id: int) -> None:
    """Run one short orchestration pass for a workflow run."""

    from angee.workflows import engine

    engine.advance(run_id)


@app.task(name="workflows.execute", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def execute_workflow_step(step_run_id: int) -> None:
    """Execute one claimed step-run outside the advance lock."""

    from angee.workflows import engine

    engine.execute(step_run_id)


@app.task(name="workflows.decision_escalate", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def escalate_workflow_decision(decision_id: int, attempt: int) -> None:
    """Resolve a decision escalation timer if it still matches the attempt."""

    from angee.workflows import engine

    engine.escalate_decision(decision_id, attempt)


@app.task(name="workflows.decision_expire", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def expire_workflow_decision(decision_id: int, attempt: int) -> None:
    """Resolve a decision expiry timer if it still matches the attempt."""

    from angee.workflows import engine

    engine.expire_decision(decision_id, attempt)


@app.periodic(cron="* * * * *", periodic_id="workflows.sweep")
@app.task(name="workflows.sweep", retry=RetryStrategy(max_attempts=3, exponential_wait=30))
def sweep_workflow_runs(_timestamp: int) -> None:
    """Advance workflow runs whose durable wake time is due."""

    from angee.workflows import engine

    engine.sweep()
