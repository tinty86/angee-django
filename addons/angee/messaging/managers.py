"""Managers that own the messaging write path — the channel-sync ingest.

A channel backend parses a source into neutral ``ParsedMessage`` rows; these
managers turn each into a :class:`~angee.messaging.models.Message` with its thread,
its recursive :class:`~angee.messaging.models.Part` tree (text content-addressed
into :class:`~angee.messaging.models.Fragment`\\s), its participants, and its
quotation edges. They carry the battle-scars the working model proved necessary:

- ``(platform, external_id)`` ``update_or_create`` keys make re-sync idempotent.
- null bytes (``\\x00``) are stripped before every write (Postgres rejects them).
- thread resolution is the 4-step RFC-5322 priority under ``select_for_update``.
- denormalised counters bump with ``F()``, never read-modify-write.
- the quotation graph FK-joins on shared fragments, skipping boilerplate quoted by
  more than :data:`_BOILERPLATE_CUTOFF` messages.

The sync runs under ``system_context``; ``created_by`` is set to the channel owner.
"""

from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING, Any

from django.apps import apps
from django.db import models, transaction

from angee.base.models import AngeeManager

if TYPE_CHECKING:
    from angee.messaging.backends import ParsedMessage, ParsedPart

# A fragment quoted by more than this many messages is boilerplate (a disclaimer or
# repeated signature); quote-linking it would join the whole corpus, so skip it.
_BOILERPLATE_CUTOFF = 100

_SUBJECT_PREFIX_RE = re.compile(
    r"^\s*(?:re|fwd|fw|aw|sv|vs|ref|tr|rif)\s*(?:\[\d+\])?\s*:\s*", re.IGNORECASE
)
_WS_RE = re.compile(r"\s+")


def strip_null_bytes(value: Any) -> Any:
    """Recursively remove ``\\x00`` from strings inside str/dict/list values.

    Email bodies routinely contain null bytes, which Postgres rejects in text/JSON
    columns; stripping them on the write path keeps a large sync from hard-failing.
    """

    if isinstance(value, str):
        return value.replace("\x00", "")
    if isinstance(value, dict):
        return {key: strip_null_bytes(item) for key, item in value.items()}
    if isinstance(value, list):
        return [strip_null_bytes(item) for item in value]
    if isinstance(value, tuple):
        return tuple(strip_null_bytes(item) for item in value)
    return value


def normalize_subject(subject: str) -> str:
    """Strip repeated ``Re:``/``Fwd:``/… prefixes and collapse whitespace for matching."""

    text = strip_null_bytes(subject or "")
    while True:
        stripped = _SUBJECT_PREFIX_RE.sub("", text, count=1)
        if stripped == text:
            break
        text = stripped
    # Casing is preserved (the prefix match is case-insensitive); the working model
    # matches threads on the case-preserved normalized subject.
    return text.strip()


def _preview(body: ParsedPart | None, *, limit: int = 280) -> str:
    """Return a short text preview from the first text node of a parsed body tree."""

    if body is None:
        return ""
    if body.text and body.role not in ("quoted", "signature"):
        return body.text[:limit]
    for child in body.children:
        found = _preview(child, limit=limit)
        if found:
            return found
    return ""


class FragmentManager(AngeeManager):
    """Content-addressed text store: one row per distinct (null-stripped) text."""

    def upsert(self, *, text: str, kind: str = "paragraph", owner_id: Any = None) -> Any:
        """Get-or-create a fragment by the SHA-256 of its cleaned (null-stripped, trimmed) text."""

        text = strip_null_bytes(text).strip()
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        fragment, _created = self.get_or_create(
            hash=digest,
            defaults={"text": text, "kind": kind, "created_by_id": owner_id},
        )
        return fragment


class ThreadManager(AngeeManager):
    """Owns thread resolution — the 4-step RFC-5322 priority under a row lock."""

    def resolve(
        self,
        *,
        platform: str,
        channel: Any,
        subject: str = "",
        in_reply_to: str = "",
        references: tuple[str, ...] = (),
        message_external_id: str = "",
        owner_id: Any = None,
    ) -> Any:
        """Resolve the thread a message belongs to, creating one if needed.

        Priority: ``In-Reply-To`` → ``References`` (newest-first, i.e. right-to-left,
        resolved in one batch query) → normalised subject → a new thread. The subject
        match and the create run under ``select_for_update`` on a deterministic
        external id (``subj:<normalized>`` or ``msg:<id>``) so two concurrent batches
        resolving the same subject collide on the unique constraint and converge to
        one thread instead of double-creating.
        """

        message_model = apps.get_model("messaging", "Message")
        if in_reply_to:
            parent = (
                message_model.objects.filter(platform=platform, external_id=in_reply_to)
                .select_related("thread")
                .first()
            )
            if parent is not None and parent.thread_id:
                return parent.thread
        if references:
            ref_map = {
                row.external_id: row
                for row in message_model.objects.filter(
                    platform=platform, external_id__in=references
                ).select_related("thread")
            }
            for external_id in reversed(references):
                row = ref_map.get(external_id)
                if row is not None and row.thread_id:
                    return row.thread

        normalized = normalize_subject(subject)
        with transaction.atomic():
            if normalized:
                existing = (
                    self.select_for_update()
                    .filter(platform=platform, subject_normalized=normalized)
                    .order_by("-created_at")
                    .first()
                )
                if existing is not None:
                    return existing
            deterministic_id = f"subj:{normalized}" if normalized else f"msg:{message_external_id}"
            thread, _created = self.select_for_update().get_or_create(
                platform=platform,
                external_id=deterministic_id,
                defaults={
                    "channel": channel,
                    "subject": strip_null_bytes(subject),
                    "subject_normalized": normalized,
                    "modality": "email_thread",
                    "created_by_id": owner_id,
                },
            )
            return thread


class MessageManager(AngeeManager):
    """Owns the message ingest write path (idempotent, null-safe, F()-counted)."""

    def ingest(self, parsed_messages: list[ParsedMessage], *, channel: Any, owner_id: Any = None) -> int:
        """Upsert each parsed message into a thread with its parts/participants/edges.

        Idempotent on ``(platform, external_id)``; null bytes stripped; thread
        counters bumped with ``F()``; quotation edges derived per message.
        """

        owner_id = owner_id if owner_id is not None else channel.owner_id
        thread_model = apps.get_model("messaging", "Thread")
        ingested: list[Any] = []
        for parsed in parsed_messages:
            if not parsed.external_id:
                continue
            with transaction.atomic():
                ingested.append(
                    self._ingest_one(parsed, channel=channel, owner_id=owner_id, thread_model=thread_model)
                )
        # Quotation runs after the whole batch lands, so a message quoting a later
        # one in the same batch still links (an inline pass would miss it).
        edges = apps.get_model("messaging", "MessageEdge").objects
        for message in ingested:
            edges.create_for_message(message)
        return len(ingested)

    def _ingest_one(self, parsed: ParsedMessage, *, channel: Any, owner_id: Any, thread_model: Any) -> Any:
        handle_model = apps.get_model("parties", "Handle")
        thread = thread_model.objects.resolve(
            platform=parsed.platform,
            channel=channel,
            subject=parsed.subject,
            in_reply_to=parsed.in_reply_to,
            references=parsed.references,
            message_external_id=parsed.external_id,
            owner_id=owner_id,
        )
        sender = None
        if parsed.sender is not None:
            sender = handle_model.objects.upsert(
                platform=parsed.sender.platform,
                value=parsed.sender.value,
                owner_id=owner_id,
                display_name=parsed.sender.display_name,
            )
        message, created = self.update_or_create(
            platform=parsed.platform,
            external_id=parsed.external_id,
            defaults={
                "thread": thread,
                "channel": channel,
                "sender": sender,
                "direction": parsed.direction,
                "status": "synced",
                "subject": strip_null_bytes(parsed.subject),
                "preview": strip_null_bytes(_preview(parsed.body)),
                "sent_at": parsed.sent_at,
                "received_at": parsed.received_at,
                "metadata": strip_null_bytes(parsed.metadata),
                "created_by_id": owner_id,
            },
        )
        message.parts.all().delete()
        if parsed.body is not None:
            self._build_parts(message, parsed.body, parent=None, position=0, owner_id=owner_id)
        self._write_participants(message, thread, parsed, sender, owner_id)
        # Counters bump only for a newly created message, so a re-sync (which
        # update_or_create resolves to the existing row) never inflates the count.
        if created:
            thread_model.objects.filter(pk=thread.pk).update(
                message_count=models.F("message_count") + 1,
                last_message_at=parsed.sent_at or thread.last_message_at,
                updated_at=parsed.sent_at or thread.last_message_at,
            )
        return message

    def _build_parts(self, message: Any, parsed: ParsedPart, *, parent: Any, position: int, owner_id: Any) -> None:
        part_model = apps.get_model("messaging", "Part")
        fragment_model = apps.get_model("messaging", "Fragment")
        file_ref = None
        fragment = None
        if parsed.content is not None:
            file_ref = self._ingest_file(parsed, owner_id)
        elif parsed.text and not parsed.children:
            fragment = fragment_model.objects.upsert(
                text=parsed.text,
                kind="signature" if parsed.role == "signature" else "quote" if parsed.role == "quoted" else "paragraph",
                owner_id=owner_id,
            )
        part = part_model.objects.create(
            message=message,
            parent=parent,
            position=position,
            type=parsed.type,
            disposition=parsed.disposition,
            role=parsed.role,
            cid=parsed.cid,
            name=parsed.name,
            fragment=fragment,
            file=file_ref,
            created_by_id=owner_id,
        )
        for index, child in enumerate(parsed.children):
            self._build_parts(message, child, parent=part, position=index, owner_id=owner_id)

    def _ingest_file(self, parsed: ParsedPart, owner_id: Any) -> Any:
        """Ingest attachment bytes into storage; returns the File or None.

        Uses the storage server-side ingest verb when available; until that lands
        (framework prereq), attachment bytes are skipped rather than half-written.
        """

        file_model = apps.get_model("storage", "File")
        ingest = getattr(file_model.objects, "ingest_bytes", None)
        if not callable(ingest) or parsed.content is None:
            return None
        return ingest(parsed.content, filename=parsed.name or "attachment.bin", owner_id=owner_id)

    def _write_participants(self, message: Any, thread: Any, parsed: ParsedMessage, sender: Any, owner_id: Any) -> None:
        participant_model = apps.get_model("messaging", "Participant")
        handle_model = apps.get_model("parties", "Handle")
        participant_model.objects.filter(message=message).delete()
        if sender is not None:
            participant_model.objects.create(
                message=message, thread=thread, handle=sender, role="from", created_by_id=owner_id
            )
        for recipient in parsed.recipients:
            handle = handle_model.objects.upsert(
                platform=recipient.handle.platform,
                value=recipient.handle.value,
                owner_id=owner_id,
                display_name=recipient.handle.display_name,
            )
            participant_model.objects.create(
                message=message, thread=thread, handle=handle, role=recipient.role, created_by_id=owner_id
            )


class MessageEdgeManager(AngeeManager):
    """Owns the cross-message graph — derived quote edges from shared fragments."""

    def create_for_message(self, message: Any) -> int:
        """Write quote edges from ``message`` to others sharing a non-boilerplate fragment.

        Skips fragments quoted by more than :data:`_BOILERPLATE_CUTOFF` messages;
        edge direction runs from the earlier message to the later one.
        """

        part_model = apps.get_model("messaging", "Part")
        fragment_ids = list(
            part_model.objects.filter(message=message, fragment__isnull=False)
            .exclude(role__in=("quoted", "signature"))
            .values_list("fragment_id", flat=True)
            .distinct()
        )
        if not fragment_ids:
            return 0
        created = 0
        for fragment_id in fragment_ids:
            sharers = (
                part_model.objects.filter(fragment_id=fragment_id)
                .values_list("message_id", flat=True)
                .distinct()
            )
            sharer_ids = list(sharers)
            if len(sharer_ids) > _BOILERPLATE_CUTOFF:
                continue
            for other_id in sharer_ids:
                if other_id == message.pk:
                    continue
                src_id, dst_id = self._direction(message.pk, other_id)
                _link, was_created = self.get_or_create(
                    src_id=src_id,
                    dst_id=dst_id,
                    kind="quote",
                    defaults={"fragment_id": fragment_id, "created_by_id": message.created_by_id},
                )
                created += int(was_created)
        return created

    def _direction(self, a_id: Any, b_id: Any) -> tuple[Any, Any]:
        """Order an edge from the earlier message to the later one (by sent_at, then pk)."""

        message_model = apps.get_model("messaging", "Message")
        rows = {
            row["pk"]: row["sent_at"]
            for row in message_model.objects.filter(pk__in=(a_id, b_id)).values("pk", "sent_at")
        }
        a_time, b_time = rows.get(a_id), rows.get(b_id)
        if a_time and b_time and a_time != b_time:
            return (a_id, b_id) if a_time < b_time else (b_id, a_id)
        return (a_id, b_id) if a_id < b_id else (b_id, a_id)
