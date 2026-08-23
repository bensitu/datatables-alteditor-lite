/**
 * Values that are treated as atomic when form-value types are made partial.
 */
export type BuiltinValue =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp
  | File
  | Blob;

/**
 * Recursively makes object properties optional while preserving atomic values,
 * collections, and arrays.
 */
export type DeepPartial<TValue> = TValue extends
  BuiltinValue | readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>
  ? TValue
  : TValue extends object
    ? {
        [TKey in keyof TValue]?: DeepPartial<TValue[TKey]>;
      }
    : TValue;

/**
 * Describes the partial values collected from an editor form.
 */
export type EditorValues<TFormValues extends object> = DeepPartial<TFormValues>;

/** Fields explicitly assigned one common value during a batch edit. */
export type BatchChanges<TFormValues extends object> = EditorValues<TFormValues>;
