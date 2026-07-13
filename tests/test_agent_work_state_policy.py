"""Contract tests for the repository's private agent work-state routing."""

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORK_STATE_INPUT = '--input work_state_path="$work_state_path"'
WORK_STATE_SETUP = (
    "repo_root=$(git rev-parse --show-toplevel) || exit 1",
    'test -L "$repo_root/.work" || exit 1',
    'work_state_path=$(cd "$repo_root/.work" && pwd -P) || exit 1',
)
WORKSPACE_OWNER = ".agents/skills/angee-workspace/SKILL.md"


def _tracked_markdown() -> list[Path]:
    result = subprocess.run(
        ["git", "ls-files", "*.md"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    paths = [ROOT / relative_path for relative_path in result.stdout.splitlines()]
    return [path for path in paths if path.is_file()]


def _shell_commands(markdown: str) -> list[str]:
    commands: list[str] = []
    continuation: list[str] = []
    in_shell_block = False

    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped in {"```bash", "```sh", "```shell"}:
            in_shell_block = True
            continue
        if in_shell_block and stripped == "```":
            in_shell_block = False
            continue
        if not in_shell_block or not stripped or stripped.startswith("#"):
            continue

        continuation.append(stripped.removesuffix("\\").rstrip())
        if not stripped.endswith("\\"):
            commands.append(" ".join(continuation))
            continuation = []

    return commands


def test_repository_routes_agent_artifacts_into_work() -> None:
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    prose = " ".join(agents.split())

    assert "design specs: `.work/plans/specs/`" in prose
    assert "plans: `.work/plans/`" in prose
    assert "notes: `.work/notes/`" in prose
    assert "handovers: `.work/handovers/`" in prose
    assert (
        "Global skill defaults such as `docs/superpowers/**` are overridden and forbidden in this repository."
    ) in prose


def test_workspace_creation_passes_validated_canonical_work_state() -> None:
    skill = (ROOT / ".agents/skills/angee-workspace/SKILL.md").read_text(encoding="utf-8")

    for required_contract in (
        "repo_root=$(git rev-parse --show-toplevel) || exit 1",
        'test -L "$repo_root/.work" || exit 1',
        'work_state_path=$(cd "$repo_root/.work" && pwd -P) || exit 1',
        'work_state_top=$(git -C "$work_state_path" rev-parse --show-toplevel) || exit 1',
        'test "$work_state_top" = "$work_state_path" || exit 1',
        'test "$(basename "$work_state_path")" != "$(basename "$repo_root")" || exit 1',
        '--input work_state_path="$work_state_path"',
        "Resolved work-state path.",
    ):
        assert required_contract in skill

    assert "do not fall back to `docs/superpowers`" in " ".join(skill.split())


def test_documented_dev_workspace_creation_flows_pass_validated_work_state_path() -> None:
    violations: list[str] = []

    for path in _tracked_markdown():
        markdown = path.read_text(encoding="utf-8")
        validates_work_state = all(step in markdown for step in WORK_STATE_SETUP) or (
            WORKSPACE_OWNER in markdown and "Create Workspace" in markdown
        )
        for command in _shell_commands(markdown):
            if "angee ws create" not in command or "--template dev" not in command:
                continue
            if WORK_STATE_INPUT not in command or not validates_work_state:
                violations.append(f"{path.relative_to(ROOT)}: {command}")

    assert not violations, "Invalid dev-workspace creation flows:\n" + "\n".join(violations)
