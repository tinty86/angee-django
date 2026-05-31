"""Django app configuration for the Angee composer."""

from __future__ import annotations

from django.apps import AppConfig


class ComposeConfig(AppConfig):
    """Composer app: emits the concrete runtime and hosts build commands.

    Listed before the base addon and source addons in ``INSTALLED_APPS`` so its
    ``import_models`` emits ``runtime/<label>/`` in app-populate phase 2 before
    any addon adopts it in the same phase. This single emit-then-adopt pass is
    why there is no build/run app-set split: the runtime is always freshly
    rendered from the abstract sources before it is loaded.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "angee.compose"

    def import_models(self) -> None:
        """Emit the concrete runtime before the source addons adopt it."""

        super().import_models()
        # Deferred: phase 2 runs after the registry is populated, so the
        # abstract source models this introspects are safe to import now.
        # ``from_settings`` owns the ANGEE_RUNTIME_DIR contract and raises if
        # it is missing — no second guard here.
        from angee.compose.runtime import AngeeRuntime

        AngeeRuntime.from_settings().emit_if_stale()
