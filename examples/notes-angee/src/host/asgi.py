"""ASGI entrypoint for the notes example."""

from __future__ import annotations

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "host.settings")

from angee.base.asgi import build_application

application = build_application()
