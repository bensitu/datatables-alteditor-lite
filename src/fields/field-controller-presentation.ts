/** Presentation choices shared by dialog and inline field controllers. */
export interface FieldControllerPresentation {
  readonly label: 'visible' | 'visually-hidden';
  readonly error: 'field' | 'external';
  readonly kind: 'dialog' | 'batch' | 'inline';
}

/** Standard field presentation used by editor dialogs. */
export const DIALOG_FIELD_PRESENTATION = Object.freeze({
  error: 'field',
  kind: 'dialog',
  label: 'visible',
} as const satisfies FieldControllerPresentation);

/** Field presentation used by multi-record editing. */
export const BATCH_FIELD_PRESENTATION = Object.freeze({
  error: 'field',
  kind: 'batch',
  label: 'visible',
} as const satisfies FieldControllerPresentation);

/** Compact field presentation used by inline editing. */
export const INLINE_FIELD_PRESENTATION = Object.freeze({
  error: 'external',
  kind: 'inline',
  label: 'visually-hidden',
} as const satisfies FieldControllerPresentation);
