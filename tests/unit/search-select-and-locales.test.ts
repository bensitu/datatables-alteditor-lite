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

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
  reject(reason: unknown): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  return {
    promise: new Promise<TValue>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    }),
    reject(reason): void {
      rejectPromise?.(reason);
    },
    resolve(value): void {
      resolvePromise?.(value);
    },
  };
}

const searchSelectMessages = {
  clear: 'Clear',
  instructions: 'Choose an option.',
  loading: 'Loading',
  loadError: 'Load error',
  noResults: 'No results',
  placeholder: 'Select',
  results: '{count} results',
  searchPlaceholder: 'Search',
  searchTooShort: 'Enter {count} characters',
  selection: '{label} selected',
} as const;

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
          loading: 'Loading',
          loadError: 'Load error',
          noResults: 'No results',
          placeholder: 'Select',
          results: '{count} results',
          searchPlaceholder: 'Search',
          searchTooShort: 'Enter {count} characters',
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
        loading: 'Loading',
        loadError: 'Load error',
        noResults: 'No results',
        placeholder: 'Select',
        results: '{count} results',
        searchPlaceholder: 'Search',
        searchTooShort: 'Enter {count} characters',
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

  it('closes when focus leaves through the clear button', () => {
    const searchSelect = new SearchSelect({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'focus-boundary',
      locale: 'en',
      messages: searchSelectMessages,
      onCommit: vi.fn(),
      options: [{ label: 'First', value: 'first' }],
      searchThreshold: 0,
      sortOptions: false,
    });
    const outsideButton = document.createElement('button');
    document.body.append(searchSelect.element, outsideButton);
    searchSelect.setValue('first');
    searchSelect.inputElement.focus();
    const clearButton = searchSelect.element.querySelector<HTMLButtonElement>(
      '.alteditor-lite-search-select__clear',
    );
    clearButton?.focus();
    expect(searchSelect.inputElement.getAttribute('aria-expanded')).toBe('true');

    outsideButton.focus();

    expect(searchSelect.inputElement.getAttribute('aria-expanded')).toBe('false');
    searchSelect.destroy();
    searchSelect.element.remove();
    outsideButton.remove();
  });
});

describe('SearchSelect remote request ownership', () => {
  it('keeps synchronous value identity while stale resolutions are ignored', async () => {
    const first = createDeferred<{ readonly label: string; readonly value: number }>();
    const second = createDeferred<{ readonly label: string; readonly value: number }>();
    const signals: AbortSignal[] = [];
    const resolveOption = vi.fn((value: number, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return value === 1 ? first.promise : second.promise;
    });
    const searchSelect = new SearchSelect<number>({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'remote-resolve',
      loadOptions: () => [],
      locale: 'en',
      messages: searchSelectMessages,
      onCommit: vi.fn(),
      resolveOption,
      searchThreshold: 0,
      sortOptions: false,
    });

    searchSelect.setValue(1);
    expect(searchSelect.getValue()).toBe(1);
    searchSelect.setValue(2);
    expect(searchSelect.getValue()).toBe(2);
    expect(signals[0]?.aborted).toBe(true);

    second.resolve({ label: 'Second', value: 2 });
    await vi.waitFor(() => {
      expect(searchSelect.inputElement.value).toBe('Second');
    });
    first.resolve({ label: 'Stale first', value: 1 });
    await Promise.resolve();
    expect(searchSelect.inputElement.value).toBe('Second');
    searchSelect.destroy();
  });

  it('aborts old searches and prevents ignored signals from winning', async () => {
    const first =
      createDeferred<readonly { readonly label: string; readonly value: string }[]>();
    const second =
      createDeferred<readonly { readonly label: string; readonly value: string }[]>();
    const signals: AbortSignal[] = [];
    const loadOptions = vi.fn((query: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return query === 'a' ? first.promise : second.promise;
    });
    const searchSelect = new SearchSelect<string>({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'remote-search',
      loadOptions,
      locale: 'en',
      messages: searchSelectMessages,
      onCommit: vi.fn(),
      resolveOption: () => undefined,
      searchThreshold: 0,
      sortOptions: false,
    });
    document.body.append(searchSelect.element);

    searchSelect.inputElement.value = 'a';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    searchSelect.inputElement.value = 'ab';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    expect(signals[0]?.aborted).toBe(true);
    second.resolve([{ label: 'Current', value: 'current' }]);
    await vi.waitFor(() => {
      expect(searchSelect.listboxElement.textContent).toContain('Current');
    });
    first.resolve([{ label: 'Stale', value: 'stale' }]);
    await Promise.resolve();
    expect(searchSelect.listboxElement.textContent).not.toContain('Stale');
    searchSelect.destroy();
  });

  it('drops remote option elements that leave the current result set', async () => {
    const wideResults = [
      { label: 'Alpha', value: 'alpha' },
      { label: 'Bravo', value: 'bravo' },
      { label: 'Charlie', value: 'charlie' },
    ] as const;
    const loadOptions = vi.fn((query: string) =>
      query === 'narrow' ? [{ label: 'Only result', value: 'only' }] : wideResults,
    );
    const searchSelect = new SearchSelect<string>({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'remote-option-lifetime',
      loadOptions,
      locale: 'en',
      messages: searchSelectMessages,
      onCommit: vi.fn(),
      resolveOption: () => undefined,
      searchThreshold: 0,
      sortOptions: false,
    });
    document.body.append(searchSelect.element);
    searchSelect.inputElement.focus();
    await vi.waitFor(() => {
      expect(searchSelect.listboxElement.children).toHaveLength(3);
    });
    const retainedOption = searchSelect.listboxElement.querySelector(
      '[data-option-token="option-0"]',
    );
    const removedOption = searchSelect.listboxElement.querySelector(
      '[data-option-token="option-2"]',
    );

    searchSelect.inputElement.value = 'narrow';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(searchSelect.listboxElement.textContent).toContain('Only result');
    });
    expect(removedOption?.isConnected).toBe(false);

    searchSelect.inputElement.value = 'wide';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(searchSelect.listboxElement.children).toHaveLength(3);
    });
    expect(
      searchSelect.listboxElement.querySelector('[data-option-token="option-0"]'),
    ).toBe(retainedOption);
    expect(
      searchSelect.listboxElement.querySelector('[data-option-token="option-2"]'),
    ).not.toBe(removedOption);
    searchSelect.destroy();
  });

  it('lets seed updates hydrate a pending selection without a value change', async () => {
    const pending = createDeferred<{ readonly label: string; readonly value: number }>();
    const onCommit = vi.fn();
    let resolveSignal: AbortSignal | undefined;
    const searchSelect = new SearchSelect<number>({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'remote-seed',
      loadOptions: () => [],
      locale: 'en',
      messages: searchSelectMessages,
      onCommit,
      resolveOption: (_value, { signal }) => {
        resolveSignal = signal;
        return pending.promise;
      },
      searchThreshold: 0,
      sortOptions: false,
    });

    searchSelect.setValue(7);
    searchSelect.setOptions([{ label: 'Seed seven', value: 7 }]);
    expect(resolveSignal?.aborted).toBe(true);
    expect(searchSelect.inputElement.value).toBe('Seed seven');
    expect(searchSelect.getValue()).toBe(7);
    expect(onCommit).not.toHaveBeenCalled();

    pending.resolve({ label: 'Stale seven', value: 7 });
    await Promise.resolve();
    expect(searchSelect.inputElement.value).toBe('Seed seven');
    searchSelect.destroy();
  });

  it('announces thresholds and query failures without losing the selection', async () => {
    const loadOptions = vi.fn(() => Promise.reject(new Error('Unavailable')));
    const searchSelect = new SearchSelect<string>({
      allowClear: true,
      allowManualValue: false,
      debounceMs: 0,
      fieldId: 'remote-errors',
      loadOptions,
      locale: 'en',
      messages: searchSelectMessages,
      onCommit: vi.fn(),
      options: [{ label: 'Existing', value: 'existing' }],
      resolveOption: () => undefined,
      searchThreshold: 2,
      sortOptions: false,
    });
    searchSelect.setValue('existing');
    document.body.append(searchSelect.element);
    searchSelect.inputElement.focus();
    expect(searchSelect.listboxElement.textContent).toContain('2');
    expect(loadOptions).not.toHaveBeenCalled();

    searchSelect.inputElement.value = 'ab';
    searchSelect.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(searchSelect.listboxElement.textContent).toContain('Load error');
    });
    expect(searchSelect.element.hasAttribute('aria-busy')).toBe(false);
    expect(
      searchSelect.element.querySelector('[role="listbox"]')?.getAttribute('aria-busy'),
    ).toBe('false');
    searchSelect.destroy();
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
