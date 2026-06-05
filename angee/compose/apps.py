"""Django app config for the Angee composer."""

from __future__ import annotations

import os
import sys

from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured


class ComposeConfig(AppConfig):
    """Import composed runtime models during app population."""

    default = True
    name = "angee.compose"
    depends_on = ("django_yamlconf",)
    emits_runtime_models = False

    def import_models(self) -> None:
        """Check or explicitly emit runtime files, then import generated models."""

        super().import_models()
        # Deferred (phase-1 AppConfig rule): importing Runtime at module top
        # would transitively import model classes (angee.resources.models.Resource,
        # AngeeModel) during phase-1 AppConfig load, before the registry is ready.
        # By phase 2 the registry is populated, so this import — and the abstract
        # source models it introspects — is safe. ``from_django`` owns the
        # ANGEE_RUNTIME_DIR contract and raises if it is missing.
        from angee.compose.runtime import Runtime

        action = os.environ.get("ANGEE_RUNTIME_ACTION")
        if action is None and sys.argv[1:3] == ["angee", "build"]:
            action = "check" if "--check" in sys.argv[3:] else "emit"
            os.environ["ANGEE_RUNTIME_ACTION"] = action
        action = action or "import"

        runtime = Runtime.from_django()
        try:
            if action == "emit":
                runtime.emit()
            elif action in {"check", "import"}:
                runtime.check()
            else:
                raise ImproperlyConfigured(f"Unknown ANGEE_RUNTIME_ACTION {action!r}")
        except RuntimeError as error:
            if action in {"check", "import"}:
                raise ImproperlyConfigured(
                    f"{error}; run `angee build` to refresh generated runtime sources"
                ) from error
            raise
        runtime.import_generated_models()
