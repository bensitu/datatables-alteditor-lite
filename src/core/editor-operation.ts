/**
 * Operations that own a modal editor dialog.
 */
export type DialogAction = 'create' | 'edit' | 'remove';

/**
 * Operations exposed by the complete editor lifecycle.
 */
export type EditorOperation = DialogAction | 'refresh';
