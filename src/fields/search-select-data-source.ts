import type { SelectOption } from './field-config.js';
import type { MaybePromise } from './field-value.js';

/** Cancellation context supplied to remote SearchSelect requests. */
export interface SearchSelectLoadContext {
  readonly signal: AbortSignal;
}

/** Loads one bounded remote option result for a search query. */
export type SearchSelectOptionLoader<TValue extends string | number> = (
  query: string,
  context: Readonly<SearchSelectLoadContext>,
) => MaybePromise<readonly SelectOption<TValue>[]>;

/** Resolves the display option for an existing remote value. */
export type SearchSelectOptionResolver<TValue extends string | number> = (
  value: TValue,
  context: Readonly<SearchSelectLoadContext>,
) => MaybePromise<SelectOption<TValue> | undefined>;
