import { describe, expect, it, vi } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import {
  ENGLISH_LANGUAGE,
  resolveLanguage,
} from '../../src/core/alt-editor-lite-language.js';
import es from '../../src/locales/es.json' with { type: 'json' };
import ja from '../../src/locales/ja.json' with { type: 'json' };
import zhCn from '../../src/locales/zh-cn.json' with { type: 'json' };
import {
  getLocale,
  getRegisteredLocaleNames,
  registerLocale,
} from '../../src/localization/locale-registry.js';
import { filterSearchOptions } from '../../src/search-select/filter-search-options.js';
import {
  isComposingEnter,
  resolveSearchSelectActiveIndex,
} from '../../src/search-select/search-select-keyboard.js';
import { SearchSelect } from '../../src/search-select/search-select.js';

import type { AltEditorLiteLanguage } from '../../src/core/alt-editor-lite-language.js';

function languageLeaves(
  value: Readonly<AltEditorLiteLanguage>,
): ReadonlyMap<string, string> {
  const leaves = new Map<string, string>();

  const visit = (currentValue: unknown, path: string): void => {
    if (typeof currentValue === 'string') {
      leaves.set(path, currentValue);
      return;
    }

    if (typeof currentValue !== 'object' || currentValue === null) {
      return;
    }

    for (const [key, nestedValue] of Object.entries(
      currentValue as Readonly<Record<string, unknown>>,
    )) {
      visit(nestedValue, path.length === 0 ? key : `${path}.${key}`);
    }
  };

  visit(value, '');
  return leaves;
}

function messageTokens(message: string): readonly string[] {
  return [...message.matchAll(/\{[^}]+\}/gu)].map(([token]) => token);
}

describe('SearchSelect local filtering', () => {
  const entries = [
    { option: { label: 'Café', value: 1 }, token: 'option-0' },
    { option: { label: 'Bravo', value: 2 }, token: 'option-1' },
    { option: { label: 'Alpha', value: 3 }, token: 'option-2' },
  ] as const;

  it('normalizes locale text without mutating source order', () => {
    expect(filterSearchOptions(entries, 'cafe', 'es', 0, false)).toEqual([entries[0]]);
    expect(filterSearchOptions(entries, 'a', 'en', 2, false)).toEqual(entries);
    expect(entries.map(({ token }) => token)).toEqual([
      'option-0',
      'option-1',
      'option-2',
    ]);
  });

  it('sorts with a collator and falls back for an invalid locale', () => {
    expect(
      filterSearchOptions(entries, '', 'en', 0, true).map(({ option }) => option.label),
    ).toEqual(['Alpha', 'Bravo', 'Café']);
    expect(filterSearchOptions(entries, 'alpha', 'invalid_locale', 0, true)).toEqual([
      entries[2],
    ]);
    expect(filterSearchOptions(entries, 'bravo', 'invalid_locale', 0, false)).toEqual([
      entries[1],
    ]);
  });
});

describe('SearchSelect keyboard state', () => {
  const enabledOptionIndices = [1, 3] as const;

  it('moves, wraps, and jumps only across enabled indices', () => {
    expect(
      resolveSearchSelectActiveIndex(enabledOptionIndices, undefined, 'ArrowDown'),
    ).toBe(1);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 1, 'ArrowDown')).toBe(3);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 3, 'ArrowDown')).toBe(1);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 1, 'ArrowUp')).toBe(3);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 3, 'ArrowUp')).toBe(1);
    expect(
      resolveSearchSelectActiveIndex(enabledOptionIndices, undefined, 'ArrowUp'),
    ).toBe(3);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 99, 'ArrowDown')).toBe(1);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 3, 'Home')).toBe(1);
    expect(resolveSearchSelectActiveIndex(enabledOptionIndices, 1, 'End')).toBe(3);
    expect(resolveSearchSelectActiveIndex([], undefined, 'ArrowDown')).toBeUndefined();
  });

  it('blocks only Enter while an IME composition is active', () => {
    expect(isComposingEnter(true, 'Enter')).toBe(true);
    expect(isComposingEnter(true, 'ArrowDown')).toBe(false);
    expect(isComposingEnter(false, 'Enter')).toBe(false);
  });
});

describe('SearchSelect document events', () => {
  it('shares one outside-pointer listener across active instances', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');
    const removeEventListener = vi.spyOn(document, 'removeEventListener');
    const createSearchSelect = (fieldId: string): SearchSelect<string> =>
      new SearchSelect({
        allowClear: true,
        allowManualValue: false,
        debounceMs: 0,
        fieldId,
        locale: 'en',
        messages: {
          clear: 'Clear',
          instructions: 'Choose an option.',
          noResults: 'No results',
          placeholder: 'Select',
          results: '{count} results',
          searchPlaceholder: 'Search',
          selection: '{label} selected',
        },
        onCommit: vi.fn(),
        options: [{ label: 'First', value: 'first' }],
        searchThreshold: 0,
        sortOptions: false,
      });

    const first = createSearchSelect('first');
    const second = createSearchSelect('second');
    expect(
      addEventListener.mock.calls.filter(([eventName]) => eventName === 'pointerdown'),
    ).toHaveLength(1);

    first.destroy();
    expect(
      removeEventListener.mock.calls.filter(([eventName]) => eventName === 'pointerdown'),
    ).toHaveLength(0);
    second.destroy();
    expect(
      removeEventListener.mock.calls.filter(([eventName]) => eventName === 'pointerdown'),
    ).toHaveLength(1);
  });

  it('reuses option elements while local filters change', () => {
    const searchSelect = new SearchSelect({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'reused-options',
      locale: 'en',
      messages: {
        clear: 'Clear',
        instructions: 'Choose an option.',
        noResults: 'No results',
        placeholder: 'Select',
        results: '{count} results',
        searchPlaceholder: 'Search',
        selection: '{label} selected',
      },
      onCommit: vi.fn(),
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Bravo', value: 'bravo' },
      ],
      searchThreshold: 0,
      sortOptions: false,
    });
    document.body.append(searchSelect.element);
    searchSelect.inputElement.focus();
    const initialAlphaOption = searchSelect.listboxElement.querySelector(
      '[data-option-token="option-0"]',
    );

    searchSelect.inputElement.value = 'alpha';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      searchSelect.listboxElement.querySelector('[data-option-token="option-0"]'),
    ).toBe(initialAlphaOption);

    searchSelect.inputElement.value = '';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    expect(
      searchSelect.listboxElement.querySelector('[data-option-token="option-0"]'),
    ).toBe(initialAlphaOption);
    searchSelect.destroy();
    searchSelect.element.remove();
  });
});

describe('locale data', () => {
  it('keeps exact keys, placeholder tokens, and non-empty reviewed text', () => {
    const englishLeaves = languageLeaves(ENGLISH_LANGUAGE);

    for (const locale of [ja, zhCn, es]) {
      const localeLeaves = languageLeaves(locale);
      expect([...localeLeaves.keys()]).toEqual([...englishLeaves.keys()]);

      for (const [key, englishMessage] of englishLeaves) {
        const translatedMessage = localeLeaves.get(key);
        expect(translatedMessage?.trim().length).toBeGreaterThan(0);
        expect(messageTokens(translatedMessage ?? '')).toEqual(
          messageTokens(englishMessage),
        );
      }
    }
  });

  it('deep-merges partial language overrides over English', () => {
    const resolvedLanguage = resolveLanguage({
      accessibility: { searchSelectResults: '{count} choices.' },
      actions: { create: 'Add' },
      locale: 'en-GB',
      searchSelect: { noResults: 'Nothing found' },
    });

    expect(resolvedLanguage).toMatchObject({
      accessibility: { searchSelectResults: '{count} choices.' },
      actions: { cancel: 'Cancel', create: 'Add' },
      locale: 'en-GB',
      searchSelect: {
        clear: 'Clear selection',
        noResults: 'Nothing found',
      },
    });
  });

  it('retains fallback text when runtime overrides contain undefined', () => {
    const languageWithUndefined = {
      actions: { create: undefined },
      locale: 'en-GB',
      searchSelect: { noResults: undefined },
    } as unknown as Parameters<typeof resolveLanguage>[0];

    expect(resolveLanguage(languageWithUndefined)).toMatchObject({
      actions: { create: 'Create' },
      locale: 'en-GB',
      searchSelect: { noResults: 'No matching options' },
    });
  });

  it('supports canonical public locale lookup', () => {
    const registeredJapanese = registerLocale(ja);
    registerLocale(zhCn);
    registerLocale(es);

    expect(getLocale('JA')).toBe(registeredJapanese);
    expect(getLocale('missing')).toBeUndefined();
    expect(getRegisteredLocaleNames()).toEqual(
      expect.arrayContaining(['en', 'ja', 'zh-CN', 'es']),
    );
    expect(() => {
      registerLocale({ locale: 'invalid_locale' });
    }).toThrow(EditorConfigurationError);
  });
});
