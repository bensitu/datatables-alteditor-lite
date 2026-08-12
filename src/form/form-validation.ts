import type { EditorValues } from '../core/editor-values.js';
import type { MaybePromise } from '../fields/field-value.js';
import type { FieldPath } from '../object-path/field-path.js';
import type { Api } from 'datatables.net';

/** Validation messages associated with declared form field paths. */
export type FormFieldErrors<TFormValues extends object> = Partial<
  Record<FieldPath<TFormValues>, string>
>;

/** Result returned by a form-level validator. */
export type FormValidationResult<TFormValues extends object> =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly fieldErrors?: Readonly<FormFieldErrors<TFormValues>>;
      readonly message?: string;
    };

/** Immutable operation context supplied to a form-level validator. */
export interface FormValidationContext<TRow extends object> {
  readonly table: Api<TRow>;
  readonly signal: AbortSignal;
  readonly operation: 'create' | 'edit';
  readonly mode: 'dialog' | 'inline';
}

/** Cross-field validator shared by dialog and inline editing. */
export type FormValidator<TRow extends object, TFormValues extends object> = (
  values: Readonly<EditorValues<TFormValues>>,
  context: FormValidationContext<TRow>,
) => MaybePromise<FormValidationResult<TFormValues>>;
