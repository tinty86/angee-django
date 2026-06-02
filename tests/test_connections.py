"""Tests for IAM connection model managers."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import connection
from django.utils import timezone
from rebac import system_context

from angee.iam.credentials import CredentialKind, StaticTokenCredentialHandler
from angee.iam.models import AccountStatus
from angee.iam.models import Client as AbstractClient
from angee.iam.models import Credential as AbstractCredential
from angee.iam.models import ExternalAccount as AbstractExternalAccount
from angee.iam.models import Vendor as AbstractVendor


class Vendor(AbstractVendor):
    """Concrete test vendor."""

    class Meta(AbstractVendor.Meta):
        """Django model options for the test model."""

        abstract = False
        app_label = "iam"
        db_table = "test_connections_vendor"


class ExternalAccount(AbstractExternalAccount):
    """Concrete test external account."""

    class Meta(AbstractExternalAccount.Meta):
        """Django model options for the test model."""

        abstract = False
        app_label = "iam"
        db_table = "test_connections_external_account"


class Client(AbstractClient):
    """Concrete test client."""

    class Meta(AbstractClient.Meta):
        """Django model options for the test model."""

        abstract = False
        app_label = "iam"
        db_table = "test_connections_client"


class Credential(AbstractCredential):
    """Concrete test credential."""

    class Meta(AbstractCredential.Meta):
        """Django model options for the test model."""

        abstract = False
        app_label = "iam"
        db_table = "test_connections_credential"


@pytest.mark.django_db(transaction=True)
def test_connection_managers_are_idempotent_and_delegate_static_token_material() -> None:
    """External account linking and credential upsert are idempotent."""

    created_models = _create_missing_tables()

    try:
        user = get_user_model().objects.create_user(
            username="connection-alice",
            email="alice@example.com",
        )

        with system_context(reason="test connections"):
            vendor = Vendor.objects.create(
                slug="example",
                display_name="Example",
                website_url="https://example.com",
            )
            client = Client.objects.create(
                vendor=vendor,
                display_name="Example prod",
                client_id="example-client",
                client_secret="secret",
            )

            first_account = ExternalAccount.objects.link(
                vendor,
                "ext-123",
                email="alice@example.com",
                display_name="Alice",
                status=AccountStatus.ERROR,
                identity_claims={"sub": "ext-123"},
                last_error="needs review",
            )
            second_account = ExternalAccount.objects.link(
                vendor,
                "ext-123",
            )

            assert second_account.pk == first_account.pk
            assert ExternalAccount.objects.count() == 1
            second_account.refresh_from_db()
            assert second_account.identity_claims == {"sub": "ext-123"}
            assert second_account.status == AccountStatus.ERROR
            assert second_account.last_error == "needs review"

            expires_at = timezone.now() + timedelta(hours=1)
            first_credential = Credential.objects.upsert_for_user(
                user,
                client,
                CredentialKind.STATIC_TOKEN,
                {"api_key": "first-key"},
                external_account=second_account,
                expires_at=expires_at,
            )
            second_credential = Credential.objects.upsert_for_user(
                user,
                client,
                CredentialKind.STATIC_TOKEN,
                {"api_key": "second-key"},
            )

            assert second_credential.pk == first_credential.pk
            assert Credential.objects.count() == 1

            second_credential.refresh_from_db()
            assert second_credential.external_account_id == second_account.pk
            assert second_credential.expires_at == expires_at
            assert second_credential.reveal() == {"api_key": "second-key"}
            assert isinstance(second_credential.handler, StaticTokenCredentialHandler)
            assert second_credential.auth_headers() == {"Authorization": "Bearer second-key"}

            with pytest.raises(ValueError, match="owned by upsert_for_user: kind"):
                Credential.objects.upsert_for_user(
                    user,
                    client,
                    CredentialKind.STATIC_TOKEN,
                    {"api_key": "third-key"},
                    **{"kind": CredentialKind.OAUTH},
                )
            with pytest.raises(ValueError, match="owned by upsert_for_user: material"):
                Credential.objects.upsert_for_user(
                    user,
                    client,
                    CredentialKind.STATIC_TOKEN,
                    {"api_key": "third-key"},
                    **{"material": {"api_key": "override"}},
                )
    finally:
        if created_models:
            with connection.schema_editor() as schema_editor:
                for model in reversed(created_models):
                    schema_editor.delete_model(model)


def _create_missing_tables() -> list[type]:
    """Create test tables only when pytest did not sync them up front."""

    existing_tables = set(connection.introspection.table_names())
    models = [Vendor, ExternalAccount, Client, Credential]
    missing = [model for model in models if model._meta.db_table not in existing_tables]
    if not missing:
        return []
    with connection.schema_editor() as schema_editor:
        for model in missing:
            schema_editor.create_model(model)
    return missing
