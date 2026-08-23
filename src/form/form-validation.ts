import type { EditorValues } from '../core/editor-values.js';
import type { MaybePromise } from '../fields/field-value.js';
import type { FieldPath } from '../object-path/field-path.js';

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

/** Operation and presentation supplied before a validation signal is attached. */
export type FormValidationRequestContext =
  | { readonly operation: 'create'; readonly mode: 'dialog' }
  | { readonly operation: 'edit'; readonly mode: 'dialog' | 'inline' }
  | { readonly operation: 'batchEdit'; readonly mode: 'dialog' };

/** Immutable operation context supplied to a form-level validator. */
export type FormValidationContext = FormValidationRequestContext & {
  readonly signal: AbortSignal;
};

/** Cross-field validator shared by dialog and inline editing. */
export type FormValidator<TFormValues extends object> = (
  values: Readonly<EditorValues<TFormValues>>,
  context: FormValidationContext,
) => MaybePromise<FormValidationResult<TFormValues>>;
