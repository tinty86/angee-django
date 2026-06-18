"""Tests for IAM identity helpers."""

from __future__ import annotations

import pytest
from django.contrib.auth import get_user_model
from strawberry import relay

from angee.iam.identity import (
    user_display_label,
    user_from_global_id,
    user_principal,
    user_public_id,
)


@pytest.mark.django_db
def test_user_principal_accepts_raw_id_and_user_global_id() -> None:
    """IAM owns principal resolution for permission-hub and addon callers."""

    user = get_user_model().objects.create_user(
        username="identity-target",
        email="identity@example.com",
        first_name="Identity",
        last_name="Target",
    )
    node_id = str(getattr(user, "sqid", user.pk))
    global_id = relay.to_base64("UserType", node_id)

    assert user_principal(str(user.pk)) == user
    assert user_principal(global_id) == user
    assert user_from_global_id(relay.GlobalID(type_name="UserType", node_id=node_id)) == user
    assert user_public_id(user.pk) == str(user.pk)
    assert user_display_label(str(user.pk)) == "Identity Target"


@pytest.mark.django_db
def test_user_principal_rejects_non_user_global_id() -> None:
    """Only the configured user GraphQL type is decoded as a user public id."""

    user = get_user_model().objects.create_user(username="identity-other", email="other@example.com")
    global_id = relay.to_base64("OAuthClientType", str(getattr(user, "sqid", user.pk)))

    with pytest.raises(ValueError, match="User principal"):
        user_principal(global_id)
