import { FormValidationRunner } from './form-validation-runner.js';

import type {
  LocalUniqueValidator,
  ValidationExecutionResult,
} from './form-validation-runner.js';
import type { EditorValues } from '../core/editor-values.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

export type { LocalUniqueValidator } from './form-validation-runner.js';

/** Result of complete native and custom form validation. */
export interface EditorFormValidationResult {
  /** Whether every enabled field is valid. */
  readonly valid: boolean;
  /** Messages keyed only by configured field paths. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/**
 * Runs native, custom, and uniqueness validation for a rendered form.
 *
 * @param controllers - Ordered form controllers.
 * @param collectValues - Lazy collection performed only after native validity.
 * @param signal - Validation request signal.
 * @param validateUnique - Optional Host-scoped local uniqueness check.
 * @param invalidMessage - Localized fallback for invalid fields.
 * @returns Stable field-error mapping.
 */
export async function validateEditorForm<TFormValues extends object>(
  controllers: readonly ManagedFieldController<TFormValues>[],
  collectValues: () => Promise<Readonly<EditorValues<TFormValues>>>,
  signal: AbortSignal,
  validateUnique: LocalUniqueValidator<TFormValues> | undefined,
  invalidMessage: string,
): Promise<EditorFormValidationResult> {
  const result: ValidationExecutionResult<TFormValues> = await new FormValidationRunner({
    allowedFieldNames: new Set(controllers.map(({ name }) => name)),
    collectValues,
    controllers,
    invalidMessage,
    ...(validateUnique === undefined ? {} : { validateUnique }),
  }).run(signal);

  if (result.valid) {
    return { fieldErrors: {}, valid: true };
  }
  return {
    fieldErrors: result.error.fieldErrors ?? {},
    valid: false,
  };
}
