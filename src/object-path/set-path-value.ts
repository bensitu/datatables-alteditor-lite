import { parseFieldPath } from './field-path.js';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const valuePrototype = Object.getPrototypeOf(value) as unknown;
  return valuePrototype === Object.prototype || valuePrototype === null;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value !== 'object') {
    return typeof value;
  }
  const constructorValue = Reflect.get(value, 'constructor') as unknown;
  if (typeof constructorValue !== 'function' || constructorValue.name.length === 0) {
    return 'object';
  }
  return constructorValue.name;
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
      throw new TypeError(
        `Cannot traverse non-plain object at "${fieldPathSegment}"; expected a plain object but found ${describeValueType(nestedValues)}.`,
      );
    }

    currentValues = nestedValues;
  }

  const finalFieldPathSegment = fieldPathSegments.at(-1);
  if (finalFieldPathSegment === undefined) {
    throw new TypeError('A field path must contain at least one segment.');
  }
  currentValues[finalFieldPathSegment] = fieldValue;
}
