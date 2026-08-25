import { hasOwn } from '../core/has-own.js';

import { parseFieldPath } from './field-path.js';

/** Result of an own-property-only path lookup. */
export type PathValueLookup =
  | { readonly found: true; readonly value: unknown }
  | { readonly found: false; readonly value: undefined };

/**
 * Looks up an own-property-only value from prevalidated path segments.
 *
 * @param sourceValues - Object that owns the values.
 * @param fieldPathSegments - Path segments previously returned by parseFieldPath.
 * @returns The path presence and its value, including an explicit undefined.
 */
export function lookupPathSegments(
  sourceValues: object,
  fieldPathSegments: readonly string[],
): PathValueLookup {
  let currentValue: unknown = sourceValues;

  for (const fieldPathSegment of fieldPathSegments) {
    if (
      typeof currentValue !== 'object' ||
      currentValue === null ||
      !hasOwn(currentValue, fieldPathSegment)
    ) {
      return { found: false, value: undefined };
    }

    currentValue = (currentValue as Readonly<Record<string, unknown>>)[fieldPathSegment];
  }

  return { found: true, value: currentValue };
}

/**
 * Looks up an own-property-only value while preserving presence information.
 *
 * @param sourceValues - Object that owns the form values.
 * @param fieldPath - Validated dot-separated field path.
 * @returns The path presence and its value, including an explicit undefined.
 */
export function lookupPathValue(
  sourceValues: object,
  fieldPath: string,
): PathValueLookup {
  return lookupPathSegments(sourceValues, parseFieldPath(fieldPath));
}

/**
 * Reads an own-property-only value from a validated object path.
 *
 * @param sourceValues - Object that owns the form values.
 * @param fieldPath - Validated dot-separated field path.
 * @returns The owned value, or undefined when the path is absent.
 */
export function getPathValue(sourceValues: object, fieldPath: string): unknown {
  return lookupPathValue(sourceValues, fieldPath).value;
}
