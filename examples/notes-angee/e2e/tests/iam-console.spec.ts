import { test, expect, roleStatePath } from "@angee/e2e";

// The IAM/Identity admin console: the menu, the grant composer, the permission
// graph, and the admin gate for non-admins. Read-only/non-destructive.

const SECTIONS = [
  { label: "Users", path: "/iam/users" },
  { label: "Roles", path: "/iam/roles" },
  { label: "Grants", path: "/iam/grants" },
  { label: "Relationships", path: "/iam/relationships" },
  { label: "Schema", path: "/iam/schema" },
  { label: "Connections", path: "/iam/connections" },
] as const;

test.describe("iam console — admin", () => {
  test.use({ storageState: roleStatePath("admin") });

  test("navigates the Identity menu across every section", async ({ page }) => {
    await page.goto("/iam");
    await expect(page).toHaveURL(/\/iam/);
    await expect(
      page.getByRole("link", { name: "Overview", exact: true }),
    ).toBeVisible({ timeout: 20000 });

    for (const section of SECTIONS) {
      await page.getByRole("link", { name: section.label, exact: true }).click();
      // Some sections append a default-group query (e.g. ?group=namespace).
      await expect(page).toHaveURL(new RegExp(`${section.path}(\\?|$)`));
    }
  });

  test("the Overview surfaces the grant composer", async ({ page }) => {
    await page.goto("/iam");
    await expect(page.getByText("Grant Role")).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder("User ID")).toBeVisible();
    await expect(page.getByLabel("Role")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Grant", exact: true }),
    ).toBeVisible();
  });

  test("the Schema view renders the permission graph", async ({ page }) => {
    await page.goto("/iam/schema");
    await expect(page.locator(".react-flow__node").first()).toBeVisible({
      timeout: 20000,
    });
    expect(await page.locator(".react-flow__node").count()).toBeGreaterThan(0);
  });
});

test.describe("iam console — non-admin boundary", () => {
  for (const role of ["alice", "bob"] as const) {
    test.describe(role, () => {
      test.use({ storageState: roleStatePath(role) });

      test(`${role} is denied the admin users list`, async ({ page }) => {
        await page.goto("/iam/users");
        // Admin-gated: a non-admin gets an empty/denied state, never user rows.
        await expect(
          page.getByText(
            /could not load|no records|not configured|unavailable|denied|permission/i,
          ),
        ).toBeVisible({ timeout: 20000 });
      });
    });
  }
});
