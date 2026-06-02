import { test, expect, roleStatePath } from "@angee/e2e";

import { NotesPage } from "../pages/notes-page";

// The record form's dirty-save behavior. Button placement + dirty-only is fixed
// (1e71bc4); the seamless post-mutation cache update is a known framework bug
// (see the plan: "Seamless post-mutation update across ALL forms/views/subs").
test.describe("notes form — dirty-save", () => {
  test.use({ storageState: roleStatePath("alice") });

  test("a clean form shows no Save/Discard; editing surfaces both in the top band", async ({ page }) => {
    const notes = new NotesPage(page);
    await notes.gotoReady();
    await notes.openFirstNote();

    // clean → dirty-only means no actions
    await expect(notes.saveButton).toHaveCount(0);
    await expect(notes.discardButton).toHaveCount(0);

    await notes.editBody(" e2e-edit");
    await expect(notes.saveButton).toBeVisible();
    await expect(notes.discardButton).toBeVisible();

    // both sit in the same (top control) band, above the form body
    const saveY = (await notes.saveButton.boundingBox())?.y ?? -1;
    const bodyY = (await page.locator(".cm-content").first().boundingBox())?.y ?? 1e9;
    expect(saveY).toBeGreaterThan(0);
    expect(saveY).toBeLessThan(bodyY);
  });

  test("Discard resets the form and clears the dirty actions", async ({ page }) => {
    const notes = new NotesPage(page);
    await notes.gotoReady();
    await notes.openFirstNote();

    await notes.editBody(" discard-me");
    await expect(notes.discardButton).toBeVisible();
    await notes.discardButton.click();
    await expect(notes.saveButton).toHaveCount(0);
    await expect(notes.discardButton).toHaveCount(0);
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
  });

  // KNOWN BUG (framework, tracked in the plan): after save the form should show
  // the saved values immediately. Today they revert to undefined until a manual
  // reload — the SDK's post-mutation urql cache update is broken, and the fix
  // must be seamless across all forms, views, and subscriptions. Enable when
  // the SDK cache-update fix lands.
  test.fixme("saving reflects the new values in-place (no reload)", async ({ page }) => {
    const notes = new NotesPage(page);
    await notes.gotoReady();
    await notes.openFirstNote();

    const stamp = ` seamless-${Date.now().toString().slice(-5)}`;
    await notes.editBody(stamp);
    await notes.saveButton.click();
    await expect(notes.saveButton).toHaveCount(0); // baseline reset (works)
    // BUG: without a reload, the body must still contain the saved text.
    await expect(page.locator(".cm-content").first()).toContainText(stamp.trim());
  });
});
