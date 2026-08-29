import type { SelectOption } from '../fields/field-config.js';
import type {
  SearchSelectOptionLoader,
  SearchSelectOptionResolver,
} from '../fields/search-select-data-source.js';

export type SearchSelectRemoteResult<TValue> =
  readonly ['ok', TValue] | readonly ['error'] | undefined;

/** Owns remote search and option-resolution requests without UI state. */
export class SearchSelectRemoteDataController<TValue extends string | number> {
  readonly #requests: (AbortController | undefined)[] = [];

  readonly #sources: readonly [
    SearchSelectOptionLoader<TValue>,
    SearchSelectOptionResolver<TValue>,
  ];

  public constructor(
    loadOptions: SearchSelectOptionLoader<TValue>,
    resolveOption: SearchSelectOptionResolver<TValue>,
  ) {
    this.#sources = [loadOptions, resolveOption];
  }

  public search(
    query: string,
  ): Promise<SearchSelectRemoteResult<readonly SelectOption<TValue>[]>> {
    return this.#run(0, query);
  }

  public resolve(
    value: TValue,
  ): Promise<SearchSelectRemoteResult<SelectOption<TValue> | undefined>> {
    return this.#run(1, value);
  }

  public cancel(channel: 0 | 1): void {
    this.#requests[channel]?.abort();
    this.#requests[channel] = undefined;
  }

  public destroy(): void {
    this.cancel(0);
    this.cancel(1);
  }

  async #run<TResult>(
    channel: 0 | 1,
    input: string | TValue,
  ): Promise<SearchSelectRemoteResult<TResult>> {
    this.cancel(channel);
    const request = new AbortController();
    this.#requests[channel] = request;
    const source = this.#sources[channel] as (
      input: string | TValue,
      context: { readonly signal: AbortSignal },
    ) => TResult | PromiseLike<TResult>;
    try {
      const value = await source(input, { signal: request.signal });
      if (this.#requests[channel] === request) {
        this.#requests[channel] = undefined;
        return ['ok', value];
      }
    } catch {
      if (this.#requests[channel] === request) {
        this.#requests[channel] = undefined;
        return ['error'];
      }
    }
    return undefined;
  }
}
