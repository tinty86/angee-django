import { test, expect, roleStatePath } from "@angee/e2e";

import { NotesPage } from "../pages/notes-page";

const UPDATED_DAY_URL = "/notes?group=updatedAt:day";

/**
 * The data-view features added this cycle: column sortability gated to orderable
 * fields, sorting the grouped field reordering the groups, column-aligned
 * aggregate totals, and the toolbar rendered as a flush control band.
 * Group-specific assertions opt into Updated·Day through the URL.
 */
test.describe("notes views — sort, group order, aggregates, control band", () => {
  test.use({ storageState: roleStatePath("alice") });

  test("only orderable columns expose a sort control, and sorting raises no GraphQL error", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      const t = m.text();
      if (/GraphQL|not defined by type|oneOf/i.test(t)) errors.push(t);
    });
    const notes = new NotesPage(page);
    await notes.gotoReady();

    // Title/Status/Updated At/Word Count are DB-orderable; Tags (a JSON/M2M list) is not.
    const expectations: ReadonlyArray<readonly [string, boolean]> = [
      ["Title", true],
      ["Status", true],
      ["Updated At", true],
      ["Word Count", true],
      ["Tags", false],
    ];
    for (const [name, sortable] of expectations) {
      const header = page
        .getByRole("columnheader", { name: new RegExp(name, "i") })
        .first();
      await expect(header).toBeVisible();
      const hasSortButton = (await header.getByRole("button").count()) > 0;
      expect(hasSortButton, `${name} should be sortable=${sortable}`).toBe(sortable);
    }

    // sorting an orderable column must not raise the @oneOf / unknown-field error
    await page
      .getByRole("columnheader", { name: /Word Count/i })
      .first()
      .getByRole("button")
      .first()
      .click();
    await page.waitForTimeout(1500);
    expect(errors, errors.join(" | ")).toHaveLength(0);
  });

  test("sorting the grouped field reorders the groups (oldest vs newest first)", async ({ page }) => {
    const notes = new NotesPage(page);
    await page.goto(UPDATED_DAY_URL);
    await expect(notes.groupHeaders.first()).toBeVisible({ timeout: 25000 });

    const firstGroupLabel = async () =>
      (await notes.groupHeaders.first().innerText()).replace(/\s+/g, " ").trim();

    const updatedAtSort = page
      .getByRole("columnheader", { name: /Updated At/i })
      .first()
      .getByRole("button")
      .first();

    await updatedAtSort.click(); // ascending → oldest day first
    await expect(notes.groupHeaders.first()).toBeVisible();
    await page.waitForTimeout(1200);
    const ascFirst = await firstGroupLabel();

    await updatedAtSort.click(); // descending → newest day first
    await page.waitForTimeout(1200);
    const descFirst = await firstGroupLabel();

    expect(ascFirst).not.toEqual(descFirst);
  });

  test("numeric aggregates render in the measure column, not the group header", async ({ page }) => {
    const notes = new NotesPage(page);
    await page.goto(UPDATED_DAY_URL);

    await expect(notes.groupHeaders.first()).toBeVisible({ timeout: 25000 });
    await expect(notes.groupHeaders.first()).not.toContainText(/\bwords\b/i);
    const groupWordCount = page
      .locator('tbody [aria-label*="Word Count:"]')
      .first();
    await expect(groupWordCount).toHaveText(/^\d[\d,]*$/);
    await expect(groupWordCount).not.toContainText(/\bwords\b/i);
    const wordCountTotal = page
      .locator('tfoot [aria-label^="Total Word Count:"]')
      .first();
    await expect(wordCountTotal).toHaveText(/^\d[\d,]*$/);
    await expect(wordCountTotal).not.toContainText(/\bwords\b/i);
  });

  test("the list toolbar renders as a flush control band under the breadcrumb", async ({ page }) => {
    const notes = new NotesPage(page);
    await notes.gotoReady();
    // the New-note action lives in the shell control band (the view toolbar),
    // not inside a card in the content area.
    await expect(
      notes.controlBand.getByRole("button", { name: /New note/i }),
    ).toBeVisible();
  });
});

// The aggregate rollups render for every login over its own scoped data.
for (const role of ["admin", "alice", "bob"] as const) {
  test.describe(`${role} — grouped aggregates`, () => {
    test.use({ storageState: roleStatePath(role) });

    test("word-count totals stay in the numeric column", async ({ page }) => {
      const notes = new NotesPage(page);
      await page.goto(UPDATED_DAY_URL);
      await expect(notes.groupHeaders.first()).toBeVisible({ timeout: 25000 });
      await expect(notes.groupHeaders.first()).not.toContainText(/\bwords\b/i);
      const groupWordCount = page
        .locator('tbody [aria-label*="Word Count:"]')
        .first();
      await expect(groupWordCount).toHaveText(/^\d[\d,]*$/);
      await expect(groupWordCount).not.toContainText(/\bwords\b/i);
      const wordCountTotal = page
        .locator('tfoot [aria-label^="Total Word Count:"]')
        .first();
      await expect(wordCountTotal).toHaveText(/^\d[\d,]*$/);
      await expect(wordCountTotal).not.toContainText(/\bwords\b/i);
    });
  });
}
