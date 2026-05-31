"""GraphQL schema contributions for Angee IAM."""

from __future__ import annotations

from typing import cast

import strawberry
import strawberry_django
from django.apps import apps
from django.contrib.auth import authenticate
from django.contrib.auth import login as auth_login
from django.contrib.auth import logout as auth_logout
from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest
from rebac import system_context
from strawberry import auto

from angee.base.graphql import AngeeNode

User = apps.get_model("iam", "User")


@strawberry_django.type(User)
class UserType(AngeeNode):
    """GraphQL projection of an Angee user."""

    username: auto
    first_name: auto
    last_name: auto
    email: auto
    is_staff: auto
    is_active: auto
    created_at: auto
    updated_at: auto


@strawberry.type
class LoginPayload:
    """Result returned by the session login mutation."""

    ok: bool
    user: UserType | None = None


@strawberry.type
class IAMQuery:
    """Session-backed IAM queries."""

    @strawberry.field
    def current_user(self, info: strawberry.Info) -> UserType | None:
        """Return the authenticated session user, if any."""

        user = getattr(_request(info), "user", None)
        if isinstance(user, AnonymousUser) or not getattr(
            user,
            "is_authenticated",
            False,
        ):
            return None
        return cast(UserType, user)


@strawberry.type
class IAMMutation:
    """Session-backed IAM mutations."""

    @strawberry.mutation
    def login(
        self,
        info: strawberry.Info,
        username: str,
        password: str,
    ) -> LoginPayload:
        """Authenticate credentials and bind the user to the session."""

        request = _request(info)
        user = authenticate(
            request,
            username=username,
            password=password,
        )
        if user is None:
            return LoginPayload(ok=False)
        with system_context(reason="iam.login"):
            auth_login(request, user)
        return LoginPayload(ok=True, user=cast(UserType, user))

    @strawberry.mutation
    def logout(self, info: strawberry.Info) -> bool:
        """Clear the current session."""

        auth_logout(_request(info))
        return True


def _request(info: strawberry.Info) -> HttpRequest:
    """Return the Django request from Strawberry's context."""

    return cast(HttpRequest, info.context.request)


schemas = {
    "public": {
        "query": [IAMQuery],
        "mutation": [IAMMutation],
        "types": [UserType],
    },
    "console": {
        "query": [IAMQuery],
        "mutation": [IAMMutation],
        "types": [UserType],
    },
}
"""GraphQL contributions installed by the IAM addon."""
