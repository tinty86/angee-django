// Relation fields (`page.vault`, `page.parent`) come back as the bare public
// sqid, but a node `id` is a base64 relay GlobalID (`btoa("PageType:pg…")`).
// They do not match, so a client-side join (page → parent, page → vault) silently
// drops rows unless the bare relation id is normalised up to the GlobalID first.

export const VAULT_TYPE = "VaultType";
export const PAGE_TYPE = "PageType";

/** Encode a bare public id as the relay GlobalID node ids carry. */
export function toGlobalId(typeName: string, id: string): string {
  return btoa(`${typeName}:${id}`);
}

/** Normalise an optional relation id up to its GlobalID, preserving null. */
export function relationGlobalId(
  typeName: string,
  id: string | null | undefined,
): string | null {
  return id ? toGlobalId(typeName, id) : null;
}
