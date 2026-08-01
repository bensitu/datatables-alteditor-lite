import { parseFieldPath } from '../object-path/field-path.js';
import { getPathValue } from '../object-path/get-path-value.js';

import type { EditorValues } from './editor-values.js';

function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const valuePrototype = Object.getPrototypeOf(value) as unknown;
  return valuePrototype === Object.prototype || valuePrototype === null;
}

function setImmutablePath(
  sourceValues: Readonly<Record<string, unknown>>,
  fieldPathSegments: readonly string[],
  fieldValue: unknown,
): Record<string, unknown> {
  const [fieldPathSegment, ...remainingSegments] = fieldPathSegments as readonly [
    string,
    ...string[],
  ];
  const updatedValues = { ...sourceValues };
  if (remainingSegments.length === 0) {
    updatedValues[fieldPathSegment] = fieldValue;
    return updatedValues;
  }

  const nestedSource = sourceValues[fieldPathSegment];
  updatedValues[fieldPathSegment] = setImmutablePath(
    isPlainRecord(nestedSource) ? nestedSource : {},
    remainingSegments,
    fieldValue,
  );
  return updatedValues;
}

/**
 * Merges only collected values whose paths were declared by field configuration.
 *
 * Each edited nested branch is recreated as a plain object. Unrelated root and
 * nested properties are retained without deep-cloning, and the original row is
 * never mutated.
 *
 * @param original - Row snapshot captured before the Edit dialog opened.
 * @param values - Enabled values collected from the Edit form.
 * @param declaredFieldPaths - Validated configured field paths.
 * @param collectedFieldValues - Explicit participating fields, including clears.
 * @returns A complete replacement row.
 */
export function mergeDeclaredFieldValues<TRow extends object, TFormValues extends object>(
  original: Readonly<TRow>,
  values: Readonly<EditorValues<TFormValues>>,
  declaredFieldPaths: readonly string[],
  collectedFieldValues?: ReadonlyMap<string, unknown>,
): TRow {
  let updatedRow: Readonly<Record<string, unknown>> = { ...original };

  for (const fieldPath of declaredFieldPaths) {
    const isExplicitlyCollected = collectedFieldValues?.has(fieldPath) ?? false;
    const fieldValue = isExplicitlyCollected
      ? collectedFieldValues?.get(fieldPath)
      : getPathValue(values, fieldPath);
    if (fieldValue === undefined && !isExplicitlyCollected) {
      continue;
    }

    updatedRow = setImmutablePath(updatedRow, parseFieldPath(fieldPath), fieldValue);
  }

  return updatedRow as TRow;
}
