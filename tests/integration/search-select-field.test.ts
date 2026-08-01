import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { validateFieldConfigurations } from '../../src/fields/validate-field-configurations.js';
import { buildEditorForm } from '../../src/form/build-editor-form.js';

import type { FieldChangeContext, FieldConfig } from '../../src/fields/field-config.js';
import type { FormController } from '../../src/form/form-controller.js';

interface SearchFormValues {
  readonly mixed: string | number;
  readonly officeId: number;
  readonly tag: string;
}

const officeChange =
  vi.fn<
    (value: number | undefined, context: FieldChangeContext<SearchFormValues>) => void
  >();

const searchFields = [
  {
    allowClear: true,
    defaultValue: 2,
    label: 'Office',
    name: 'officeId',
    onChange: officeChange,
    options: [
      { disabled: true, label: 'Disabled office', value: 1 },
      { label: 'Tokyo', value: 2 },
      { label: 'Zürich', value: 3 },
    ],
    required: true,
    sortOptions: true,
    type: 'search-select',
  },
  {
    allowClear: true,
    allowManualValue: true,
    label: 'Tag',
    name: 'tag',
    options: [
      { label: 'Red', value: 'red' },
      { label: '東京', value: 'tokyo' },
    ],
    type: 'search-select',
  },
  {
    defaultValue: '1',
    label: 'Mixed identity',
    name: 'mixed',
    options: [
      { label: 'Numeric one', value: 1 },
      { label: 'String one', value: '1' },
    ],
    type: 'search-select',
  },
] satisfies readonly FieldConfig<SearchFormValues>[];

let activeForm: FormController<SearchFormValues> | undefined;

afterEach(() => {
  activeForm?.destroy();
  activeForm = undefined;
  officeChange.mockReset();
  document.body.replaceChildren();
});

function createSearchForm(): FormController<SearchFormValues> {
  activeForm = buildEditorForm(searchFields, 'search-select-test', ENGLISH_LANGUAGE);
  document.body.append(activeForm.element);
  return activeForm;
}

function keyboardEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key });
}

describe('SearchSelect field integration', () => {
  it('renders secure combobox semantics and round-trips typed identities', async () => {
    const form = createSearchForm();
    const officeField = form.getField('officeId');
    const officeInput = officeField?.element.querySelector<HTMLInputElement>(
      'input[role="combobox"]',
    );
    const officeLabel = officeField?.element.querySelector('label');
    const controlledListboxId = officeInput?.getAttribute('aria-controls');

    if (
      officeField === null ||
      officeInput === null ||
      officeInput === undefined ||
      controlledListboxId === null ||
      controlledListboxId === undefined
    ) {
      throw new Error('Expected complete SearchSelect semantics.');
    }
    expect(officeLabel?.htmlFor).toBe(officeInput.id);
    expect(officeInput.getAttribute('aria-autocomplete')).toBe('list');
    expect(officeInput.getAttribute('aria-describedby')).toContain(
      'search-select-test-field-0-instructions',
    );
    expect(
      officeField.element.querySelector(`#${controlledListboxId}`)?.getAttribute('role'),
    ).toBe('listbox');
    expect(officeInput.value).toBe('Tokyo');

    expect(await form.collect()).toMatchObject({
      mixed: '1',
      officeId: 2,
    });
    expect(await Promise.resolve(form.getField('mixed')?.getValue())).toBe('1');

    form.getField('mixed')?.setValue(1);
    expect(await Promise.resolve(form.getField('mixed')?.getValue())).toBe(1);
  });

  it('filters locally and supports every committed keyboard path', async () => {
    const form = createSearchForm();
    const officeField = form.getField('officeId');
    const officeInput = officeField?.element.querySelector<HTMLInputElement>('input');
    if (officeField === null || officeInput === null || officeInput === undefined) {
      throw new Error('Expected a SearchSelect input.');
    }

    officeInput.focus();
    officeInput.value = 'zurich';
    officeInput.dispatchEvent(new Event('input', { bubbles: true }));
    const listbox = officeField.element.querySelector<HTMLElement>('[role="listbox"]');
    expect(listbox?.textContent).toContain('Zürich');
    expect(listbox?.textContent).not.toContain('Tokyo');

    const endEvent = keyboardEvent('End');
    officeInput.dispatchEvent(endEvent);
    expect(endEvent.defaultPrevented).toBe(true);
    officeInput.dispatchEvent(keyboardEvent('Enter'));
    expect(await Promise.resolve(officeField.getValue())).toBe(3);
    expect(officeInput.getAttribute('aria-expanded')).toBe('false');

    officeInput.focus();
    officeInput.dispatchEvent(keyboardEvent('Home'));
    officeInput.dispatchEvent(keyboardEvent('ArrowDown'));
    officeInput.dispatchEvent(keyboardEvent('ArrowUp'));
    const escapeEvent = keyboardEvent('Escape');
    officeInput.dispatchEvent(escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(officeInput.getAttribute('aria-expanded')).toBe('false');

    officeField.setValue(undefined);
    officeInput.value = '';
    officeInput.dispatchEvent(keyboardEvent('Backspace'));
    await expect(form.validate()).resolves.toMatchObject({ valid: false });
    expect(officeInput.getAttribute('aria-invalid')).toBe('true');
  });

  it('pauses filtering and Enter selection during IME composition', () => {
    const form = createSearchForm();
    const tagField = form.getField('tag');
    const tagInput = tagField?.element.querySelector<HTMLInputElement>('input');
    if (tagInput === null || tagInput === undefined) {
      throw new Error('Expected a SearchSelect input.');
    }

    tagInput.focus();
    tagInput.dispatchEvent(new CompositionEvent('compositionstart'));
    tagInput.value = '東';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    const compositionEnter = keyboardEvent('Enter');
    tagInput.dispatchEvent(compositionEnter);
    expect(compositionEnter.defaultPrevented).toBe(true);
    expect(tagField?.getValue()).toBeUndefined();

    tagInput.dispatchEvent(new CompositionEvent('compositionend'));
    expect(tagField?.element.querySelector('[role="listbox"]')?.textContent).toContain(
      '東京',
    );
  });

  it('commits manual strings on Tab and clears with the accessible button', async () => {
    const form = createSearchForm();
    const tagField = form.getField('tag');
    const tagInput = tagField?.element.querySelector<HTMLInputElement>('input');
    const clearButton = tagField?.element.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear selection"]',
    );
    if (
      tagField === null ||
      tagInput === null ||
      tagInput === undefined ||
      clearButton === null ||
      clearButton === undefined
    ) {
      throw new Error('Expected a complete SearchSelect field.');
    }

    tagInput.focus();
    tagInput.value = 'custom-tag';
    tagInput.dispatchEvent(new Event('input', { bubbles: true }));
    tagInput.dispatchEvent(keyboardEvent('Tab'));
    expect(await Promise.resolve(tagField.getValue())).toBe('custom-tag');
    expect(clearButton.hidden).toBe(false);

    clearButton.click();
    expect(await Promise.resolve(tagField.getValue())).toBeUndefined();
    expect(clearButton.hidden).toBe(true);
  });

  it('rebuilds dynamic tokens, retains exact values, and observably clears stale values', async () => {
    const form = createSearchForm();
    const officeField = form.getField('officeId');
    if (officeField?.setOptions === undefined) {
      throw new Error('Expected dynamic SearchSelect options.');
    }

    officeField.setOptions([
      { label: 'Tokyo renamed', value: 2 },
      { label: 'Osaka', value: 4 },
    ]);
    expect(await Promise.resolve(officeField.getValue())).toBe(2);
    expect(officeField.element.querySelector('input')?.value).toBe('Tokyo renamed');

    officeField.setOptions([{ label: 'Osaka', value: 4 }]);
    expect(await Promise.resolve(officeField.getValue())).toBeUndefined();
    await vi.waitFor(() => {
      expect(officeChange).toHaveBeenCalled();
    });
    expect(officeChange.mock.calls.at(-1)?.[0]).toBeUndefined();
  });

  it('rejects unknown values and releases its DOM on destroy', () => {
    const form = createSearchForm();
    const officeField = form.getField('officeId');
    const tagField = form.getField('tag');

    expect(() => {
      officeField?.setValue(99);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      tagField?.setOptions?.([{ label: 'Numeric', value: 1 }]);
    }).toThrow(EditorConfigurationError);

    officeField?.destroy();
    expect(form.getField('officeId')).toBeNull();
    expect(document.querySelector('[data-field-name="officeId"]')).toBeNull();
  });
});

describe('SearchSelect runtime configuration', () => {
  it('rejects empty, duplicate, oversized, and invalid timing configuration', () => {
    const baseField = {
      label: 'Office',
      name: 'officeId',
      type: 'search-select',
    } as const;

    expect(() => {
      validateFieldConfigurations<SearchFormValues>([{ ...baseField, options: [] }]);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFieldConfigurations<SearchFormValues>([
        {
          ...baseField,
          options: [
            { label: 'One', value: 1 },
            { label: 'Duplicate', value: 1 },
          ],
        },
      ]);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFieldConfigurations<SearchFormValues>([
        {
          ...baseField,
          options: Array.from({ length: 5001 }, (_value, index) => ({
            label: String(index),
            value: index,
          })),
        },
      ]);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFieldConfigurations<SearchFormValues>([
        { ...baseField, options: [{ label: 'One', value: 1 }], searchThreshold: -1 },
      ]);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFieldConfigurations<SearchFormValues>([
        { ...baseField, debounceMs: 1.5, options: [{ label: 'One', value: 1 }] },
      ]);
    }).toThrow(EditorConfigurationError);
  });

  it('rejects manual values when any option is numeric at runtime', () => {
    const invalidField = {
      allowManualValue: true,
      label: 'Office',
      name: 'officeId',
      options: [{ label: 'One', value: 1 }],
      type: 'search-select',
    } as unknown as FieldConfig<SearchFormValues>;

    expect(() => {
      validateFieldConfigurations([invalidField]);
    }).toThrow(EditorConfigurationError);
  });
});
