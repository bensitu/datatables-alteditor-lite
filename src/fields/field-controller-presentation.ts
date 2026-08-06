/** Presentation choices shared by dialog and inline field controllers. */
export interface FieldControllerPresentation {
  readonly label: 'visible' | 'visually-hidden';
  readonly error: 'field' | 'external';
}

/** Standard field presentation used by editor dialogs. */
export const DIALOG_FIELD_PRESENTATION = Object.freeze({
  error: 'field',
  label: 'visible',
} as const satisfies FieldControllerPresentation);

/** Compact field presentation used by inline editing. */
export const INLINE_FIELD_PRESENTATION = Object.freeze({
  error: 'external',
  label: 'visually-hidden',
} as const satisfies FieldControllerPresentation);
