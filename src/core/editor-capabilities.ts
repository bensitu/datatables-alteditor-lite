import type { EditMode } from './edit-mode.js';

/** Features available from one editor instance. */
export interface EditorCapabilities {
  readonly createDialog: boolean;
  readonly editDialog: boolean;
  readonly inlineEdit: boolean;
  readonly removeDialog: boolean;
  readonly refresh: boolean;
}

/** Derives instance capabilities from the selected edit presentation. */
export function resolveEditorCapabilities(
  editMode: EditMode,
): Readonly<EditorCapabilities> {
  return Object.freeze({
    createDialog: true,
    editDialog: editMode === 'dialog',
    inlineEdit: editMode === 'inlineDoubleClick' || editMode === 'inlineHover',
    refresh: true,
    removeDialog: true,
  });
}
