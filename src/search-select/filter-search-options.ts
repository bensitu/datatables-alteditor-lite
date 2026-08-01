import type { SelectOption } from '../fields/field-config.js';

/** Option paired with its stable DOM token. */
export interface SearchOptionEntry<TValue extends string | number> {
  readonly token: string;
  readonly option: SelectOption<TValue>;
}

function normalizeSearchText(text: string, locale: string): string {
  const compatibilityText = text.normalize('NFKD').replace(/\p{M}+/gu, '');

  try {
    return compatibilityText.toLocaleLowerCase(locale);
  } catch {
    return compatibilityText.toLocaleLowerCase();
  }
}

function createLabelCollator(locale: string): Intl.Collator {
  try {
    return new Intl.Collator(locale, {
      numeric: true,
      sensitivity: 'base',
      usage: 'sort',
    });
  } catch {
    return new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: 'base',
      usage: 'sort',
    });
  }
}

/**
 * Filters and optionally sorts local SearchSelect options.
 *
 * @param entries - Stable token-option pairs.
 * @param query - Current user query.
 * @param locale - BCP 47 matching locale.
 * @param searchThreshold - Minimum normalized query length before filtering.
 * @param shouldSortOptions - Whether to sort labels with Intl.Collator.
 * @returns A new result array without mutating configured options.
 */
export function filterSearchOptions<TValue extends string | number>(
  entries: readonly SearchOptionEntry<TValue>[],
  query: string,
  locale: string,
  searchThreshold: number,
  shouldSortOptions: boolean,
): readonly SearchOptionEntry<TValue>[] {
  const normalizedQuery = normalizeSearchText(query.trim(), locale);
  const shouldFilter = normalizedQuery.length >= searchThreshold;
  const filteredEntries = shouldFilter
    ? entries.filter(({ option }) =>
        normalizeSearchText(option.label, locale).includes(normalizedQuery),
      )
    : [...entries];

  if (!shouldSortOptions) {
    return filteredEntries;
  }

  const labelCollator = createLabelCollator(locale);
  return [...filteredEntries].sort((leftEntry, rightEntry) =>
    labelCollator.compare(leftEntry.option.label, rightEntry.option.label),
  );
}
