import { describe, expect, it, vi } from 'vitest';

import { validateEditorForm } from '../../src/form/validate-editor-form.js';

import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';

interface ValidationValues {
  readonly first: string;
  readonly second: string;
}

function createValidationController(input: {
  readonly isDisabled?: boolean;
  readonly name: 'first' | 'second';
  readonly nativeResult?: FieldValidationResult;
  readonly customResult?: FieldValidationResult;
}): ManagedFieldController<ValidationValues> {
  const element = document.createElement('div');
  return {
    clearError: vi.fn(),
    destroy: vi.fn(),
    element,
    focus: vi.fn(),
    getValue: vi.fn(() => ''),
    isDisabled: vi.fn(() => input.isDisabled ?? false),
    name: input.name,
    runOnChange: vi.fn(() => Promise.resolve()),
    setDisabled: vi.fn(),
    setValue: vi.fn(),
    showError: vi.fn(),
    validateCustom: vi.fn(() => Promise.resolve(input.customResult ?? { valid: true })),
    validateNative: vi.fn(() => input.nativeResult ?? { valid: true }),
  };
}

describe('validateEditorForm', () => {
  it('skips disabled fields and supplies a native fallback message', async () => {
    const disabledController = createValidationController({
      isDisabled: true,
      name: 'first',
      nativeResult: { valid: false },
    });
    const invalidController = createValidationController({
      name: 'second',
      nativeResult: { valid: false },
    });
    const collectValues = vi.fn(() => Promise.resolve({ first: 'one', second: 'two' }));

    await expect(
      validateEditorForm(
        [disabledController, invalidController],
        collectValues,
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      fieldErrors: { second: 'Enter a valid value.' },
      valid: false,
    });
    expect(collectValues).not.toHaveBeenCalled();
  });

  it('keeps custom errors ahead of uniqueness and adds new unique errors', async () => {
    const invalidController = createValidationController({
      customResult: { valid: false },
      name: 'first',
    });
    const validController = createValidationController({ name: 'second' });

    await expect(
      validateEditorForm(
        [invalidController, validController],
        () => Promise.resolve({ first: 'one', second: 'two' }),
        new AbortController().signal,
        () => ({ first: 'Unique first.', second: 'Unique second.' }),
      ),
    ).resolves.toEqual({
      fieldErrors: {
        first: 'Enter a valid value.',
        second: 'Unique second.',
      },
      valid: false,
    });
  });
});
