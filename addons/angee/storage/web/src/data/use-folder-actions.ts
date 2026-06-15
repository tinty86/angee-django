import { useAuthoredMutation, useBusyRun } from "@angee/sdk";

import {
  CREATE_FOLDER_MUTATION,
  DELETE_FOLDER_MUTATION,
  UPDATE_FOLDER_MUTATION,
  type CreateFolderData,
  type CreateFolderVariables,
  type DeleteFolderData,
  type DeleteFolderVariables,
  type UpdateFolderData,
  type UpdateFolderVariables,
} from "./documents";

export interface FolderActions {
  busy: boolean;
  /** Create a folder in a drive, optionally nested under a parent folder. */
  create: (input: {
    drive: string;
    name: string;
    parent: string | null;
  }) => Promise<void>;
  /** Rename a folder. */
  rename: (id: string, name: string) => Promise<void>;
  /** Delete a folder; its files fall back to the drive root. */
  remove: (id: string) => Promise<void>;
}

/**
 * Folder write verbs over the gated `createFolder` and the folder CRUD
 * mutations; `onChanged` fires after each so the navigator can refetch its tree.
 */
export function useFolderActions(
  options: { onChanged?: () => void } = {},
): FolderActions {
  const { onChanged } = options;
  const [createFolder] = useAuthoredMutation<
    CreateFolderData,
    CreateFolderVariables
  >(CREATE_FOLDER_MUTATION);
  const [updateFolder] = useAuthoredMutation<
    UpdateFolderData,
    UpdateFolderVariables
  >(UPDATE_FOLDER_MUTATION);
  const [deleteFolder] = useAuthoredMutation<
    DeleteFolderData,
    DeleteFolderVariables
  >(DELETE_FOLDER_MUTATION);
  const { busy, run } = useBusyRun(onChanged);

  return {
    busy,
    create: ({ drive, name, parent }) =>
      run(async () => {
        await createFolder({ data: { drive, name, parent } });
      }),
    rename: (id, name) =>
      run(async () => {
        await updateFolder({ data: { id, name } });
      }),
    remove: (id) =>
      run(async () => {
        await deleteFolder({ id });
      }),
  };
}
