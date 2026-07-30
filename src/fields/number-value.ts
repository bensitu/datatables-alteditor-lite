/**
 * Result of normalizing a native number input string.
 */
export type NumberNormalizationResult =
  | { readonly valid: true; readonly value: number | null | undefined }
  | { readonly valid: false };

/**
 * Normalizes a native number input without ever returning an empty string.
 *
 * @param inputValue - Native input string.
 * @param emptyValue - Configured representation for an empty control.
 * @returns A number, the configured empty value, or an invalid result.
 */
export function normalizeNumberValue(
  inputValue: string,
  emptyValue: null | undefined,
): NumberNormalizationResult {
  if (inputValue.length === 0) {
    return { valid: true, value: emptyValue };
  }

  const numericValue = Number(inputValue);
  return Number.isNaN(numericValue)
    ? { valid: false }
    : { valid: true, value: numericValue };
}
