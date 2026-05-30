#!/usr/bin/env python
"""Django management entrypoint for the notes example."""

from __future__ import annotations

import os
import sys
from pathlib import Path


def main() -> None:
    """Run Django management."""

    src_dir = Path(__file__).resolve().parent / "src"
    sys.path.insert(0, str(src_dir))
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "host.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
