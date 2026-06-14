// English fallback strings for @angee/base primitives. The host runtime owns
// the active translations; these are the defaults used when a key is missing.

export const enBaseMessages: Record<string, string> = {
  "search.clear": "Clear search",
  "search.placeholder": "Search...",
  "toast.dismiss": "Dismiss notification",
  "modal.confirm": "Confirm",
  "modal.cancel": "Cancel",
  "modal.done": "Done",
  "dialog.close": "Close",
  "alert.dismiss": "Dismiss",
  "pager.prev": "Previous page",
  "pager.next": "Next page",
  "pager.rowsPerPage": "Rows per page",
  "pager.customRowsPerPage": "Custom rows per page",
  "pager.apply": "Apply",
  "selection.clear": "Clear",
  "selection.selected": "selected",
  "numberField.increment": "Increase value",
  "numberField.decrement": "Decrease value",
  "list.loading": "Loading...",
};

export const enBaseBundle = { base: enBaseMessages } as const;
