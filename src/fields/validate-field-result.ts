import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { FieldValidationResult } from '../contracts/field-controller.js';

/** Checks the shape returned by a consumer field validator. */
export function validateFieldResult(
  result: unknown,
  fieldName: string,
): FieldValidationResult {
  const record = result as Readonly<Record<string, unknown>> | null;
  if (
    typeof record !== 'object' ||
    record === null ||
    typeof record['valid'] !== 'boolean' ||
    (record['message'] !== undefined && typeof record['message'] !== 'string')
  ) {
    throw new EditorConfigurationError(
      `Field "${fieldName}" returned an invalid validation result.`,
    );
  }
  return result as FieldValidationResult;
}
