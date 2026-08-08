import { describe, expect, it, vi } from 'vitest';

import { validateEditorForm } from '../../src/form/validate-editor-form.js';

import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';

interface ValidationValues {
  readonly first: string;
  readonly second: string;
}

function createValidationController(input: {
  readonly customValidator?: ManagedFieldController<ValidationValues>['validateCustom'];
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
    validateCustom:
      input.customValidator ??
      vi.fn(() => Promise.resolve(input.customResult ?? { valid: true })),
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

  it('maps a rejected validator to its field without cancelling peers', async () => {
    const validatorFailure = new Error('Validator service failed.');
    let peerSignal: AbortSignal | undefined;
    const peerValidator: ManagedFieldController<ValidationValues>['validateCustom'] = (
      _values,
      signal,
    ) => {
      peerSignal = signal;
      return Promise.resolve({ valid: true });
    };
    const failingController = createValidationController({
      customValidator: vi.fn(() => Promise.reject(validatorFailure)),
      name: 'first',
    });
    const peerController = createValidationController({
      customValidator: vi.fn(peerValidator),
      name: 'second',
    });

    await expect(
      validateEditorForm(
        [failingController, peerController],
        () => Promise.resolve({ first: 'one', second: 'two' }),
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      fieldErrors: { first: 'Enter a valid value.' },
      valid: false,
    });
    expect(peerSignal?.aborted).toBe(false);
  });
});
