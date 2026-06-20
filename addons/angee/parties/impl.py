"""Integration-level descriptor for a connected contacts directory.

The :class:`~angee.parties.models.Directory` child's ``backend_class`` selects the
protocol (carddav / …); this parent-level ``impl_class`` descriptor gives the
integration its board category and branding, so a connected directory is a proper
``bridge`` integration rather than the null/draft one.
"""

from __future__ import annotations

from angee.integrate.impl import IntegrationImpl


class DirectoryIntegrationImpl(IntegrationImpl):
    """Marks an integration as a contacts directory for the integrations surface."""

    key = "directory"
    category = "bridge"
    label = "Contacts directory"
    icon = "address-book"
