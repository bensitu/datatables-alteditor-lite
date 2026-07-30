import type { AltEditorLiteError } from './alt-editor-lite-error.js';
import type { DialogAction } from './editor-operation.js';

/**
 * Complete public lifecycle state for an editor instance.
 */
export type EditorState =
  | { readonly status: 'ready' }
  | { readonly status: 'opening'; readonly action: DialogAction }
  | {
      readonly status: 'open';
      readonly action: DialogAction;
      readonly submissionError?: AltEditorLiteError;
    }
  | { readonly status: 'submitting'; readonly action: DialogAction }
  | { readonly status: 'refreshing' }
  | { readonly status: 'closing'; readonly action: DialogAction }
  | { readonly status: 'destroyed' };
