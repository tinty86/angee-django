"""Tests for the built-in IAM addon contracts."""

from __future__ import annotations

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from rebac import RebacMixin
from rebac.managers import RebacManager
from rebac.permissions_mixin import RebacPermissionsMixin


def test_user_source_model_owns_auth_identity() -> None:
    """The IAM source user composes Django auth, REBAC, and Angee IDs."""

    from angee.iam.models import User, UserManager

    field_names = {field.name for field in User._meta.get_fields()}

    assert User._meta.abstract is True
    assert issubclass(User, AbstractBaseUser)
    assert issubclass(User, RebacPermissionsMixin)
    assert issubclass(User, RebacMixin)
    manager = User._meta.managers_map["objects"]
    assert isinstance(manager, UserManager)
    assert isinstance(manager, BaseUserManager)
    assert isinstance(manager, RebacManager)
    assert User.USERNAME_FIELD == "username"
    assert {"username", "email", "sqid", "is_staff", "is_active"} <= (field_names)
    assert "groups" not in field_names
    assert "user_permissions" not in field_names
