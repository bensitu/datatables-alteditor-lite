/**
 * Operations that own a modal editor dialog.
 */
export type DialogAction = 'create' | 'edit' | 'remove';

/**
 * Operations exposed by the complete editor lifecycle.
 */
export type EditorOperation = DialogAction | 'refresh';

/** Presentation surface that initiated an editor operation. */
export type EditorOperationMode = 'dialog' | 'inline' | 'api';

/** Stable public identity associated with an Edit operation. */
export interface EditorOperationTarget {
  readonly rowIndex: number;
  readonly rowId?: string;
  readonly columnIndex?: number;
  readonly columnName?: string;
  readonly fieldNames: readonly string[];
}
