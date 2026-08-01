/**
 * A value that can be returned directly or by a promise-compatible object.
 */
export type MaybePromise<TValue> = TValue | PromiseLike<TValue>;

/**
 * Derives the precise controller value from a field configuration.
 */
export type FieldValue<TConfig> = TConfig extends { readonly type: 'number' }
  ? TConfig extends { readonly emptyValue: null }
    ? number | null
    : number | undefined
  : TConfig extends { readonly type: 'checkbox' }
    ? boolean
    : TConfig extends { readonly type: 'file' }
      ? TConfig extends { readonly multiple: true }
        ? TConfig extends { readonly encoding: 'data-url' }
          ? readonly string[]
          : readonly File[]
        : TConfig extends { readonly encoding: 'data-url' }
          ? string | null
          : File | null
      : TConfig extends {
            readonly type: 'search-select';
            readonly allowManualValue: true;
          }
        ? string | undefined
        : TConfig extends {
              readonly type: 'select' | 'radio' | 'search-select';
              readonly options: readonly {
                readonly value: infer TOptionValue;
              }[];
            }
          ? TOptionValue | undefined
          : string;
