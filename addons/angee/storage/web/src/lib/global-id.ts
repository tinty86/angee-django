// The relay node `id` is a base64 GlobalID (`btoa("DriveType:drv…")`), but the
// schema returns relation fields (`file.drive`, `folder.parent`, …) as the bare
// public sqid (`public_id_of`). Normalise those bare ids up to the GlobalID so a
// relation matches the related row's `id` for client-side joins — and so the
// value still works as a GlobalID mutation input.

export const DRIVE_TYPE = "DriveType";
export const FOLDER_TYPE = "FolderType";

/** Encode a bare public id as the relay GlobalID for its type. */
export function toGlobalId(typeName: string, id: string): string {
  return btoa(`${typeName}:${id}`);
}

/** The GlobalID for a relation field's bare id, or `null` when absent. */
export function relationGlobalId(
  typeName: string,
  id: string | null | undefined,
): string | null {
  return id ? toGlobalId(typeName, id) : null;
}
