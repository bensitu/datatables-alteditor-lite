/**
 * Operations that own a modal editor dialog.
 */
export type DialogAction = 'create' | 'edit' | 'batchEdit' | 'remove';

/**
 * Operations exposed by the complete editor lifecycle.
 */
export type EditorOperation = DialogAction | 'refresh';

/** Presentation surface that initiated an editor operation. */
export type EditorOperationMode = 'dialog' | 'inline' | 'api';

/** Stable host-neutral identity associated with an editor operation. */
export interface EditorOperationTarget<TKey = unknown> {
  readonly key?: TKey;
  readonly fieldNames: readonly string[];
}
