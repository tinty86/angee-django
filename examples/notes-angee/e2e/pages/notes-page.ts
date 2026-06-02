import { expect, type Locator } from "@playwright/test";
import { PageObject } from "@angee/e2e";

/** The `/notes` data-view page: list/board, toolbar controls, and the pager. */
export class NotesPage extends PageObject {
  readonly path = "/notes";

  /** A note's row/card, located by its visible title. */
  noteByTitle(title: string): Locator {
    return this.page.getByText(title);
  }

  // --- toolbar / control band ---
  get newNoteButton(): Locator {
    return this.page.getByRole("button", { name: "New note" });
  }
  get groupFavoritesButton(): Locator {
    return this.page.getByRole("button", { name: /filter, group, favorites/i });
  }
  get visibleFieldsButton(): Locator {
    return this.page.getByRole("button", { name: /visible fields/i });
  }
  get listViewButton(): Locator {
    return this.page.getByRole("button", { name: /list view/i });
  }
  get boardViewButton(): Locator {
    return this.page.getByRole("button", { name: /board view/i });
  }

  // --- pager ---
  /** The "Records N-M / total" label (a control in the pager). */
  get recordsLabel(): Locator {
    return this.page.locator('[aria-label^="Records "]').first();
  }
  get nextPageButton(): Locator {
    return this.page.getByRole("button", { name: /next page/i });
  }
  get prevPageButton(): Locator {
    return this.page.getByRole("button", { name: /previous page/i });
  }

  // --- chrome ---
  get userMenuButton(): Locator {
    return this.page.getByRole("button", { name: /user menu/i });
  }
  get chatterToggle(): Locator {
    return this.page.getByRole("button", { name: /chatter/i });
  }

  // --- rows ---
  get rows(): Locator {
    return this.page.locator("tbody tr");
  }

  /** Navigate to /notes and wait past the "Loading workspace…" bootstrap until
   * the list (its pager record label) has rendered. */
  async gotoReady(): Promise<void> {
    await this.goto();
    // Wait past "Loading workspace…" AND the initial "/ 0" until the query
    // resolves and the pager shows a real (non-zero) total.
    await expect(this.recordsLabel).toHaveAttribute(
      "aria-label",
      /\/\s*[1-9][\d,]*/,
      { timeout: 25000 },
    );
  }

  /** Read the pager's record total ("Records 1-50 / 10052" → 10052). */
  async recordTotal(): Promise<number> {
    const label = (await this.recordsLabel.getAttribute("aria-label")) ?? "";
    const match = label.match(/\/\s*([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, "")) : 0;
  }

  /** Open the Visible-fields chooser; returns its column checkbox items. */
  async openVisibleFields(): Promise<Locator> {
    await this.visibleFieldsButton.click();
    const items = this.page.getByRole("menuitemcheckbox");
    await items.first().waitFor({ state: "visible" });
    return items;
  }

  /** Open the Filter/Group/Favorites popover. */
  async openGroupFavorites(): Promise<void> {
    await this.groupFavoritesButton.click();
    await this.page.getByText("Group by", { exact: false }).first().waitFor();
  }

  /** Navigate to the first record's form by clicking its row. */
  async openFirstNote(): Promise<void> {
    await this.rows.first().click();
    await this.page.waitForURL(/\/notes\/.+/, { timeout: 10000 });
  }
}
