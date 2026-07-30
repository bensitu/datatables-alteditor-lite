import { parseFieldPath } from './field-path.js';

/**
 * Reads an own-property-only value from a validated object path.
 *
 * @param sourceValues - Object that owns the form values.
 * @param fieldPath - Validated dot-separated field path.
 * @returns The owned value, or undefined when the path is absent.
 */
export function getPathValue(sourceValues: object, fieldPath: string): unknown {
  let currentValue: unknown = sourceValues;

  for (const fieldPathSegment of parseFieldPath(fieldPath)) {
    if (
      typeof currentValue !== 'object' ||
      currentValue === null ||
      !Object.hasOwn(currentValue, fieldPathSegment)
    ) {
      return undefined;
    }

    currentValue = (currentValue as Readonly<Record<string, unknown>>)[fieldPathSegment];
  }

  return currentValue;
}
