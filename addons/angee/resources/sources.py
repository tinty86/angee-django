"""Registry of resource source types.

A resource entry names its source by a manifest key — ``path`` for a local file,
``url`` for a remote one. The ``resources`` addon owns the source-type seam but
registers only the local ``path`` source; an addon that owns outbound networking,
``angee.integrate``, registers the ``url`` source, so ``resources`` itself stays
free of any network concern. Each source declares how to normalize its manifest
value and how to materialize an entry to a local file.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from django.apps import AppConfig
from django.core.exceptions import ImproperlyConfigured

if TYPE_CHECKING:
    from angee.resources.entries import ResourceEntry


@dataclass(frozen=True, slots=True)
class ResourceSource:
    """One resource source type, keyed by its manifest key (``path``/``url``)."""

    key: str
    """The manifest key that selects this source in a resource declaration."""

    normalize: Callable[[AppConfig, Any], str]
    """Return the stored source value from one raw manifest value."""

    materialize: Callable[[ResourceEntry], Path]
    """Return the local file path for one entry, fetching/resolving as needed."""


_REGISTRY: dict[str, ResourceSource] = {}


def register_source(source: ResourceSource) -> None:
    """Register a resource source type, failing fast on a duplicate key."""

    if source.key in _REGISTRY:
        raise ImproperlyConfigured(f"resource source {source.key!r} is already registered")
    _REGISTRY[source.key] = source


def source_keys() -> frozenset[str]:
    """Return every registered source key."""

    return frozenset(_REGISTRY)


def get_source(key: str) -> ResourceSource:
    """Return the registered source for ``key``, or raise with an install hint."""

    try:
        return _REGISTRY[key]
    except KeyError as error:
        raise ImproperlyConfigured(
            f"resource source {key!r} is not registered; the addon that provides it "
            f"(e.g. angee.integrate for 'url') must be installed"
        ) from error
