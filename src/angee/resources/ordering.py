"""Order resource entries by their declared dependency edges."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence

from angee.resources.entries import ResourceEntry
from angee.resources.exceptions import ResourceLoadError

EntryKey = tuple[str, str]
"""Dictionary key identifying one resource entry by addon and source."""


def order_entries(
    entries: Sequence[ResourceEntry],
) -> tuple[ResourceEntry, ...]:
    """Return entries in dependency order, preserving independent order."""

    by_key: dict[EntryKey, ResourceEntry] = {}
    position: dict[EntryKey, int] = {}
    addon_names: dict[str, str] = {}
    for index, entry in enumerate(entries):
        key = _entry_key(entry)
        if key in by_key:
            raise ResourceLoadError(
                f"duplicate resource entry {entry.display}"
            )
        by_key[key] = entry
        position[key] = index
        addon_names[entry.addon.name] = entry.addon.name
        addon_names[entry.addon.label] = entry.addon.name

    outgoing: dict[EntryKey, list[EntryKey]] = defaultdict(list)
    indegree = {key: 0 for key in by_key}
    for key, entry in by_key.items():
        for dependency in entry.depends_on:
            dependency_key = _dependency_key(entry, dependency, addon_names)
            if dependency_key not in by_key:
                raise ResourceLoadError(
                    f"{entry.display}: depends_on target not selected: "
                    f"{dependency}"
                )
            outgoing[dependency_key].append(key)
            indegree[key] += 1

    ready = sorted(
        (key for key, count in indegree.items() if count == 0),
        key=position.__getitem__,
    )
    ordered: list[ResourceEntry] = []
    while ready:
        key = ready.pop(0)
        ordered.append(by_key[key])
        for child in sorted(outgoing[key], key=position.__getitem__):
            indegree[child] -= 1
            if indegree[child] == 0:
                ready.append(child)
        ready.sort(key=position.__getitem__)
    if len(ordered) != len(by_key):
        raise ResourceLoadError("cycle detected in resource depends_on")
    return tuple(ordered)


def _entry_key(entry: ResourceEntry) -> EntryKey:
    """Return the dependency graph key for ``entry``."""

    return (entry.addon.name, entry.source)


def _dependency_key(
    entry: ResourceEntry,
    dependency: str,
    addon_names: dict[str, str],
) -> EntryKey:
    """Return the entry key addressed by one ``depends_on`` value."""

    if ":" in dependency:
        addon_ref, source = dependency.split(":", 1)
        return (addon_names.get(addon_ref, addon_ref), source)
    return (entry.addon.name, dependency)
