"""Demo document + lines models for the F6 editable-lines Hasura tests.

A ``SaleDoc`` document owns ordered ``SaleLine`` children — the framework
stand-in for the arpee SalesOrder/Invoice document-with-lines shape (§3.14).
The parent is a REBAC resource (``linesdemo/document``, owner-gated write); the
child carries no row policy of its own — its rows are created, updated, and
deleted under the parent's authorization (the §3.4 elevation the write backend
applies after the parent write preflight). Both are concrete rows in a real
installed app so pytest-django builds the tables and ``rebac sync`` loads the
adjacent ``permissions.zed``.
"""

from __future__ import annotations

from django.db import models

from angee.base.models import AngeeDataModel


class SaleDoc(AngeeDataModel):
    """An owner-gated document whose lines are edited transactionally."""

    sqid_prefix = "sdc_"

    title = models.CharField(max_length=200)
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta(AngeeDataModel.Meta):
        """Concrete REBAC document model for the editable-lines tests."""

        abstract = False
        app_label = "linesdemo"
        db_table = "test_linesdemo_document"
        rebac_resource_type = "linesdemo/document"
        rebac_id_attr = "sqid"


class Product(AngeeDataModel):
    """An owner-gated catalogue row a line may reference (visibility target).

    Its own REBAC policy is what a line's ``product`` public-id decode is scoped
    to: a line may only reference a product the caller can read, so a decode that
    ran under the §3.4 child elevation (sudo) instead of the caller's actor would
    leak invisible rows — the hole the two-phase diff closes.
    """

    sqid_prefix = "prd_"

    name = models.CharField(max_length=200)

    class Meta(AngeeDataModel.Meta):
        """Concrete owner-gated product model for line-relation visibility tests."""

        abstract = False
        app_label = "linesdemo"
        db_table = "test_linesdemo_product"
        rebac_resource_type = "linesdemo/product"
        rebac_id_attr = "sqid"


class SaleLine(AngeeDataModel):
    """One ordered child line of a :class:`SaleDoc` (no row policy of its own)."""

    sqid_prefix = "sln_"

    document = models.ForeignKey(
        SaleDoc,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    product = models.ForeignKey(
        Product,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="+",
    )
    label = models.CharField(max_length=200)
    quantity = models.IntegerField(default=1)
    position = models.IntegerField(default=0)

    class Meta(AngeeDataModel.Meta):
        """Concrete child-line model; no ``rebac_resource_type`` by design."""

        abstract = False
        app_label = "linesdemo"
        db_table = "test_linesdemo_line"
        ordering = ("position", "pk")
