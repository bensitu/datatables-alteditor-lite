/**
 * Result of normalizing a native number input string.
 */
export type NumberNormalizationResult =
  | { readonly valid: true; readonly value: number | null | undefined }
  | { readonly valid: false };

const DECIMAL_NUMBER_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

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
  const normalizedInput = inputValue.trim();
  if (normalizedInput.length === 0) {
    return { valid: true, value: emptyValue };
  }
  if (normalizedInput !== inputValue || !DECIMAL_NUMBER_PATTERN.test(normalizedInput)) {
    return { valid: false };
  }

  const numericValue = Number(normalizedInput);
  return !Number.isFinite(numericValue)
    ? { valid: false }
    : { valid: true, value: Object.is(numericValue, -0) ? 0 : numericValue };
}
