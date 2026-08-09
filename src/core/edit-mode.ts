import { EditorConfigurationError } from './alt-editor-lite-error.js';

/** Edit presentation enabled for one editor instance. */
export type EditMode = 'dialog' | 'inlineDoubleClick' | 'inlineHover';

/** Default edit presentation. */
export const DEFAULT_EDIT_MODE: EditMode = 'dialog';

/** Resolves and validates the configured edit presentation. */
export function resolveEditMode(value: unknown): EditMode {
  const editMode = value ?? DEFAULT_EDIT_MODE;
  if (
    editMode !== 'dialog' &&
    editMode !== 'inlineDoubleClick' &&
    editMode !== 'inlineHover'
  ) {
    throw new EditorConfigurationError('editMode is not valid.');
  }
  return editMode;
}
