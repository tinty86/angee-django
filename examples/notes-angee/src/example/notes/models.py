"""Source models for the notes addon."""

from __future__ import annotations

from django.db import models
from django_sqids import SqidsField

from angee.base.fields import StateField
from angee.base.mixins import (
    AuditMixin,
    HistoryMixin,
    RevisionMixin,
    SqidMixin,
)
from angee.base.models import AngeeModel


class Note(SqidMixin, AuditMixin, AngeeModel, HistoryMixin, RevisionMixin):
    """A short note used to exercise backend composition.

    Metadata changes are audited through ``history``; the ``body`` field is
    versioned through ``revisions`` so edits can be rolled back.
    """

    revisioned_fields = ("body",)

    class Status(models.TextChoices):
        """Lifecycle states a note moves through."""

        DRAFT = "draft", "Draft"
        IN_REVIEW = "in_review", "In Review"
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    sqid = SqidsField(real_field_name="id", prefix="nte", min_length=8)
    title = models.CharField(max_length=160)
    body = models.TextField(blank=True, default="")
    status = StateField(choices_enum=Status, default=Status.DRAFT)
    tags = models.JSONField(blank=True, default=list)
    is_starred = models.BooleanField(default=False, db_index=True)
    reminder_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        """Django model options."""

        abstract = True
        ordering = ("-updated_at", "title", "sqid")
        rebac_resource_type = "notes/note"
        rebac_id_attr = "sqid"

    def __str__(self) -> str:
        """Return the note title for Django displays."""

        return self.title

    @property
    def word_count(self) -> int:
        """Return the number of whitespace-delimited words in the body."""

        return len(self.body.split())
