import { parseFieldPath } from './field-path.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const valuePrototype = Object.getPrototypeOf(value) as unknown;
  return valuePrototype === Object.prototype || valuePrototype === null;
}

/**
 * Writes a value through own properties while creating only plain objects.
 *
 * @param targetValues - Plain object that will own the collected form values.
 * @param fieldPath - Validated dot-separated field path.
 * @param fieldValue - Value to assign at the final segment.
 * @throws TypeError when an existing intermediate value is not a plain object.
 */
export function setPathValue(
  targetValues: Record<string, unknown>,
  fieldPath: string,
  fieldValue: unknown,
): void {
  const fieldPathSegments = parseFieldPath(fieldPath);
  let currentValues = targetValues;

  for (const fieldPathSegment of fieldPathSegments.slice(0, -1)) {
    if (!Object.hasOwn(currentValues, fieldPathSegment)) {
      currentValues[fieldPathSegment] = {};
    }

    const nestedValues = currentValues[fieldPathSegment];
    if (!isPlainRecord(nestedValues)) {
      throw new TypeError(`Cannot traverse non-plain object at "${fieldPathSegment}".`);
    }

    currentValues = nestedValues;
  }

  const finalFieldPathSegment = fieldPathSegments.reduce(
    (_previousSegment, fieldPathSegment) => fieldPathSegment,
  );
  currentValues[finalFieldPathSegment] = fieldValue;
}
