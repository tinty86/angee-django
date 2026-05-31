"""HTTP GraphQL tests for IAM session verbs."""

from __future__ import annotations

import json
from typing import Any, cast

from django.apps import apps
from django.core.management import call_command
from django.test import Client, TransactionTestCase
from rebac import system_context

Note = apps.get_model("notes", "Note")


class IAMGraphQLTests(TransactionTestCase):
    """Drive IAM GraphQL fields through the public HTTP endpoint."""

    def setUp(self) -> None:
        call_command("rebac", "sync", verbosity=0)
        call_command(
            "resources", "load", "demo", allow_non_dev=True, verbosity=0
        )
        with system_context(reason="test-setup"):
            self.welcome = Note.objects.get(title="Welcome to Angee")
        self.client = Client()

    def test_login_current_user_and_logout_use_session_cookie(self) -> None:
        anonymous = self.graphql("query { currentUser { username } }")
        self.assertEqual(anonymous["data"], {"currentUser": None})

        logged_in = self.graphql(
            """
            mutation {
              login(username: "alice", password: "alice") {
                ok
                user { username isStaff }
              }
            }
            """
        )

        self.assertEqual(
            logged_in["data"],
            {
                "login": {
                    "ok": True,
                    "user": {"username": "alice", "isStaff": True},
                }
            },
        )

        current = self.graphql(
            "query { currentUser { username isStaff } }"
        )
        self.assertEqual(
            current["data"],
            {"currentUser": {"username": "alice", "isStaff": True}},
        )

        logged_out = self.graphql("mutation { logout }")
        self.assertEqual(logged_out["data"], {"logout": True})

        anonymous_again = self.graphql(
            "query { currentUser { username } }"
        )
        self.assertEqual(anonymous_again["data"], {"currentUser": None})

    def test_notes_page_and_update_by_relay_id(self) -> None:
        self.graphql(
            """
            mutation {
              login(username: "alice", password: "alice") {
                ok
              }
            }
            """
        )
        page = self.graphql(
            """
            query {
              notes(first: 10) {
                totalCount
                edges {
                  node {
                    id
                    title
                    tags
                    wordCount
                  }
                }
              }
            }
            """
        )

        notes = page["data"]["notes"]
        self.assertGreaterEqual(notes["totalCount"], 3)
        welcome = next(
            edge["node"]
            for edge in notes["edges"]
            if edge["node"]["title"] == "Welcome to Angee"
        )
        relay_id = welcome["id"]
        self.assertNotEqual(relay_id, self.welcome.sqid)
        self.assertIn("backend", welcome["tags"])
        self.assertGreater(welcome["wordCount"], 0)

        by_id = self.graphql(
            """
            query NoteByID($id: ID!) {
              note(id: $id) { id title }
            }
            """,
            {"id": relay_id},
        )
        self.assertEqual(
            by_id["data"]["note"],
            {"id": relay_id, "title": "Welcome to Angee"},
        )

        updated = self.graphql(
            """
            mutation UpdateNote($id: ID!) {
              updateNote(
                data: {id: $id, title: "Welcome through Relay"}
              ) {
                id
                title
              }
            }
            """,
            {"id": relay_id},
        )
        self.assertEqual(
            updated["data"]["updateNote"],
            {"id": relay_id, "title": "Welcome through Relay"},
        )

    def test_notes_connection_paginates_in_declared_order(self) -> None:
        alice = Client()
        self.login(alice, "alice")
        full = self.notes(alice)
        ordered = [edge["node"]["title"] for edge in full["edges"]]

        first_page = self.post(
            alice,
            """
            query {
              notes(first: 1) {
                pageInfo { hasNextPage endCursor }
                edges { node { title } }
              }
            }
            """,
        )["data"]["notes"]
        next_page = self.post(
            alice,
            """
            query After($cursor: String) {
              notes(first: 1, after: $cursor) {
                edges { node { title } }
              }
            }
            """,
            {"cursor": first_page["pageInfo"]["endCursor"]},
        )["data"]["notes"]

        # Meta.ordering is ("-updated_at", "title", "sqid"); keyset pages
        # follow that order without overlap.
        self.assertEqual(first_page["edges"][0]["node"]["title"], ordered[0])
        self.assertTrue(first_page["pageInfo"]["hasNextPage"])
        self.assertEqual(next_page["edges"][0]["node"]["title"], ordered[1])

    def test_note_aggregate_counts_are_actor_scoped(self) -> None:
        self.graphql(
            """
            mutation {
              login(username: "alice", password: "alice") {
                ok
              }
            }
            """
        )
        aggregate = self.graphql(
            """
            query {
              total: noteAggregate {
                count
                groups { count }
              }
              byStatus: noteAggregate(groupBy: [STATUS]) {
                count
                groups { status count }
              }
              byMonth: noteAggregate(groupBy: [UPDATED_AT_MONTH]) {
                count
                groups { updatedAtMonth count }
              }
            }
            """
        )["data"]

        self.assertEqual(aggregate["total"], {"count": 3, "groups": []})
        self.assertEqual(
            {
                group["status"]: group["count"]
                for group in aggregate["byStatus"]["groups"]
            },
            {"active": 2, "draft": 1},
        )
        self.assertEqual(aggregate["byStatus"]["count"], 3)
        self.assertEqual(aggregate["byMonth"]["count"], 3)
        self.assertTrue(aggregate["byMonth"]["groups"][0]["updatedAtMonth"])

    def test_non_owner_cannot_read_another_users_notes(self) -> None:
        alice = Client()
        self.login(alice, "alice")
        alice_notes = self.notes(alice)
        welcome_id = next(
            edge["node"]["id"]
            for edge in alice_notes["edges"]
            if edge["node"]["title"] == "Welcome to Angee"
        )

        bob = Client()
        self.login(bob, "bob")
        bob_notes = self.notes(bob)
        bob_titles = {
            edge["node"]["title"] for edge in bob_notes["edges"]
        }

        self.assertNotIn("Welcome to Angee", bob_titles)
        self.assertEqual(
            bob_titles,
            {"Draft idea", "Bug triage notes", "1:1 agenda"},
        )

        # bob's scope hides alice's note even when addressed by relay id.
        scoped_out = self.post(
            bob,
            "query NoteByID($id: ID!) { note(id: $id) { id } }",
            {"id": welcome_id},
        )
        self.assertEqual(scoped_out["data"]["note"], None)

    def test_anonymous_mutation_is_denied_with_a_code(self) -> None:
        anonymous = Client()
        payload = self.post(
            anonymous,
            'mutation { createNote(data: {title: "x"}) { id } }',
        )

        self.assertEqual(
            payload["errors"][0]["extensions"]["code"],
            "PERMISSION_DENIED",
        )

    def login(self, client: Client, username: str) -> None:
        """Establish a session for ``username`` with the demo password."""

        result = self.post(
            client,
            """
            mutation Login($username: String!, $password: String!) {
              login(username: $username, password: $password) { ok }
            }
            """,
            {"username": username, "password": username},
        )
        self.assertTrue(result["data"]["login"]["ok"])

    def notes(self, client: Client) -> dict[str, Any]:
        """Return the relay connection of notes visible to ``client``."""

        page = self.post(
            client,
            """
            query {
              notes(first: 20) {
                totalCount
                edges { node { id title } }
              }
            }
            """,
        )
        return cast(dict[str, Any], page["data"]["notes"])

    def graphql(
        self,
        query: str,
        variables: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute one error-free GraphQL operation as ``self.client``."""

        payload = self.post(self.client, query, variables)
        self.assertNotIn("errors", payload)
        return payload

    def post(
        self,
        client: Client,
        query: str,
        variables: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Execute one GraphQL operation against the public schema."""

        response = client.post(
            "/graphql/public/",
            data=json.dumps({"query": query, "variables": variables or {}}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        return cast(dict[str, Any], json.loads(response.content))
