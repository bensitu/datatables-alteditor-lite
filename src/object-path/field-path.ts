import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { BuiltinValue } from '../core/editor-values.js';

type ForbiddenFieldPathSegment = '__proto__' | 'constructor' | 'prototype';
type StringFieldKey<TValue> = Exclude<
  Extract<keyof TValue, string>,
  ForbiddenFieldPathSegment
>;
type TraversableFieldValue<TValue> =
  NonNullable<TValue> extends
    | BuiltinValue
    | readonly unknown[]
    | ReadonlyMap<unknown, unknown>
    | ReadonlySet<unknown>
    ? never
    : NonNullable<TValue> extends object
      ? NonNullable<TValue>
      : never;
type FieldPathAtDepth<
  TValue,
  TDepth extends readonly unknown[],
> = TDepth['length'] extends 5
  ? never
  : {
      [TKey in StringFieldKey<TValue>]:
        | TKey
        | (TraversableFieldValue<TValue[TKey]> extends never
            ? never
            : `${TKey}.${FieldPathAtDepth<
                TraversableFieldValue<TValue[TKey]>,
                readonly [...TDepth, unknown]
              >}`);
    }[StringFieldKey<TValue>];

/**
 * Safe object path for a form-value object, limited to five object levels.
 */
export type FieldPath<TFormValues extends object> = FieldPathAtDepth<
  TFormValues,
  readonly []
>;

const FORBIDDEN_FIELD_PATH_SEGMENTS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
]);
const FIELD_PATH_SEGMENT_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$-]*$/u;

/**
 * Parses and validates a runtime field path.
 *
 * @param fieldPath - Consumer-supplied dot-separated field path.
 * @returns Validated path segments.
 * @throws EditorConfigurationError for malformed, array-like, or
 * prototype-related segments.
 */
export function parseFieldPath(fieldPath: string): readonly string[] {
  const fieldPathSegments = fieldPath.split('.');

  if (
    fieldPath.length === 0 ||
    fieldPathSegments.length > 5 ||
    fieldPathSegments.some(
      (fieldPathSegment) =>
        !FIELD_PATH_SEGMENT_PATTERN.test(fieldPathSegment) ||
        FORBIDDEN_FIELD_PATH_SEGMENTS.has(fieldPathSegment),
    )
  ) {
    throw new EditorConfigurationError(`Invalid field path: "${fieldPath}".`);
  }

  return fieldPathSegments;
}
