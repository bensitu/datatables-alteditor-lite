import type { SelectOption } from '../fields/field-config.js';

/** Option paired with its stable DOM token. */
export interface SearchOptionEntry<TValue extends string | number> {
  readonly token: string;
  readonly option: SelectOption<TValue>;
}

const normalizedLabelByOption = new WeakMap<SelectOption, Map<string, string>>();

const labelCollatorByLocale = new Map<string, Intl.Collator>();

function normalizeSearchText(text: string, locale: string): string {
  const compatibilityText = text.normalize('NFKD').replace(/\p{M}+/gu, '');

  try {
    return compatibilityText.toLocaleLowerCase(locale);
  } catch {
    return compatibilityText.toLocaleLowerCase();
  }
}

function createLabelCollator(locale: string): Intl.Collator {
  const existingCollator = labelCollatorByLocale.get(locale);
  if (existingCollator !== undefined) {
    return existingCollator;
  }

  let collator: Intl.Collator;
  try {
    collator = new Intl.Collator(locale, {
      numeric: true,
      sensitivity: 'base',
      usage: 'sort',
    });
  } catch {
    collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: 'base',
      usage: 'sort',
    });
  }
  labelCollatorByLocale.set(locale, collator);
  return collator;
}

function normalizedOptionLabel(option: SelectOption, locale: string): string {
  let normalizedByLocale = normalizedLabelByOption.get(option);
  if (normalizedByLocale === undefined) {
    normalizedByLocale = new Map<string, string>();
    normalizedLabelByOption.set(option, normalizedByLocale);
  }

  const existingLabel = normalizedByLocale.get(locale);
  if (existingLabel !== undefined) {
    return existingLabel;
  }

  const normalizedLabel = normalizeSearchText(option.label, locale);
  normalizedByLocale.set(locale, normalizedLabel);
  return normalizedLabel;
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
        normalizedOptionLabel(option, locale).includes(normalizedQuery),
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
