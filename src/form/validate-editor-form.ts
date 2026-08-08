import type { EditorValues } from '../core/editor-values.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/**
 * Result of complete native and custom form validation.
 */
export interface FormValidationResult {
  /** Whether every enabled field is valid. */
  readonly valid: boolean;
  /** Messages keyed only by configured field paths. */
  readonly fieldErrors: Readonly<Record<string, string>>;
}

/** Internal callback for table-scoped local uniqueness checks. */
export type LocalUniqueValidator<TFormValues extends object> = (
  values: Readonly<EditorValues<TFormValues>>,
) => Readonly<Record<string, string>>;

/**
 * Runs native validation first, then custom validators concurrently.
 *
 * @param controllers - Ordered form controllers.
 * @param collectValues - Lazy collection performed only after native validity.
 * @param signal - Validation request signal.
 * @param validateUnique - Optional table-scoped local uniqueness check.
 * @param invalidMessage - Localized fallback for invalid fields.
 * @returns Stable field-error mapping.
 */
export async function validateEditorForm<TFormValues extends object>(
  controllers: readonly ManagedFieldController<TFormValues>[],
  collectValues: () => Promise<Readonly<EditorValues<TFormValues>>>,
  signal: AbortSignal,
  validateUnique?: LocalUniqueValidator<TFormValues>,
  invalidMessage = 'Enter a valid value.',
): Promise<FormValidationResult> {
  const fieldErrors: Record<string, string> = {};

  for (const controller of controllers) {
    if (controller.isDisabled()) {
      continue;
    }

    const validationResult = controller.validateNative();
    if (!validationResult.valid) {
      fieldErrors[controller.name] = validationResult.message ?? invalidMessage;
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, valid: false };
  }

  const values = await collectValues();
  const validatorAbortController = new AbortController();
  const validatorSignal = AbortSignal.any([signal, validatorAbortController.signal]);
  let customResults: readonly {
    readonly name: string;
    readonly result: Awaited<
      ReturnType<ManagedFieldController<TFormValues>['validateCustom']>
    >;
  }[];
  try {
    customResults = await Promise.all(
      controllers
        .filter((controller) => !controller.isDisabled())
        .map(async (controller) => ({
          name: controller.name,
          result: await controller.validateCustom(values, validatorSignal),
        })),
    );
  } catch (error: unknown) {
    validatorAbortController.abort(error);
    throw error;
  }

  for (const customResult of customResults) {
    if (!customResult.result.valid) {
      fieldErrors[customResult.name] = customResult.result.message ?? invalidMessage;
    }
  }

  if (validateUnique !== undefined) {
    for (const [fieldName, message] of Object.entries(validateUnique(values))) {
      if (!Object.hasOwn(fieldErrors, fieldName)) {
        fieldErrors[fieldName] = message;
      }
    }
  }

  return {
    fieldErrors,
    valid: Object.keys(fieldErrors).length === 0,
  };
}
