/** Original value relationship captured when a batch form opens. */
export type BatchFieldBaseline<TValue> =
  { readonly status: 'common'; readonly value: TValue } | { readonly status: 'mixed' };

/** Current semantic value relationship for one batch field. */
export type BatchFieldCurrentState<TValue> =
  BatchFieldBaseline<TValue> | { readonly status: 'overridden'; readonly value: TValue };

/** Shared batch field state used by presentation, validation, and collection. */
export interface BatchFieldState<TValue> {
  readonly baseline: BatchFieldBaseline<TValue>;
  readonly current: BatchFieldCurrentState<TValue>;
}
