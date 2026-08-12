import { describe, expect, it, vi } from 'vitest';

import { FormValidationRunner } from '../../src/form/form-validation-runner.js';

import type { EditorValues } from '../../src/core/editor-values.js';
import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';
import type { FormValidationResult } from '../../src/form/form-validation.js';

interface ValidationValues {
  readonly end: string;
  readonly start: string;
  readonly summary: string;
}

function createController(
  name: keyof ValidationValues,
  customResult: FieldValidationResult = { valid: true },
): ManagedFieldController<ValidationValues> {
  return {
    clearError: vi.fn(),
    destroy: vi.fn(),
    element: document.createElement('div'),
    focus: vi.fn(),
    getValue: vi.fn(() => ''),
    isDisabled: vi.fn(() => false),
    isReadOnly: vi.fn(() => false),
    isRequired: vi.fn(() => false),
    name,
    runOnChange: vi.fn(() => Promise.resolve()),
    setDisabled: vi.fn(),
    setReadOnly: vi.fn(),
    setRequired: vi.fn(),
    setValue: vi.fn(),
    showError: vi.fn(),
    validateCustom: vi.fn(() => Promise.resolve(customResult)),
    validateNative: vi.fn(() => ({ valid: true })),
  };
}

const values: ValidationValues = {
  end: '2026-08-12',
  start: '2026-08-13',
  summary: 'Schedule',
};

describe('FormValidationRunner', () => {
  it('keeps earlier field errors and adds form field and global errors', async () => {
    const validateForm = vi.fn(
      (
        candidate: Readonly<EditorValues<ValidationValues>>,
      ): FormValidationResult<ValidationValues> => {
        expect(Object.isFrozen(candidate)).toBe(true);
        return {
          fieldErrors: {
            end: 'The end date must follow the start date.',
            summary: 'Update the schedule summary.',
          },
          message: 'Review the schedule.',
          valid: false,
        };
      },
    );
    const runner = new FormValidationRunner<ValidationValues>({
      allowedFieldNames: new Set(['end', 'start', 'summary']),
      collectValues: () => values,
      controllers: [
        createController('start'),
        createController('end', {
          message: 'The end date format is invalid.',
          valid: false,
        }),
        createController('summary'),
      ],
      invalidMessage: 'Enter a valid value.',
      validateForm,
      validateUnique: () => ({
        end: 'The end date is already used.',
        start: 'The start date is already used.',
      }),
    });

    await expect(runner.run(new AbortController().signal)).resolves.toMatchObject({
      error: {
        fieldErrors: {
          end: 'The end date format is invalid.',
          start: 'The start date is already used.',
          summary: 'Update the schedule summary.',
        },
        message: 'Review the schedule.',
      },
      message: 'Review the schedule.',
      valid: false,
    });
    expect(validateForm).toHaveBeenCalledOnce();
  });

  it('returns the immutable candidate when form validation succeeds', async () => {
    const runner = new FormValidationRunner<ValidationValues>({
      allowedFieldNames: new Set(['end', 'start', 'summary']),
      collectValues: () => values,
      controllers: [createController('start')],
      invalidMessage: 'Enter a valid value.',
      validateForm: () => ({ valid: true }),
    });

    const result = await runner.run(new AbortController().signal);
    expect(result).toMatchObject({ valid: true, values });
    expect(result.valid && Object.isFrozen(result.values)).toBe(true);
  });

  it('stops waiting when the current validation is aborted', async () => {
    let validationSignal: AbortSignal | undefined;
    let resolveValidation:
      ((result: FormValidationResult<ValidationValues>) => void) | undefined;
    const pendingValidation = new Promise<FormValidationResult<ValidationValues>>(
      (resolve) => {
        resolveValidation = resolve;
      },
    );
    const runner = new FormValidationRunner<ValidationValues>({
      allowedFieldNames: new Set(['end', 'start', 'summary']),
      collectValues: () => values,
      controllers: [createController('start')],
      invalidMessage: 'Enter a valid value.',
      validateForm: (_candidate, signal) => {
        validationSignal = signal;
        return pendingValidation;
      },
    });
    const abortController = new AbortController();

    const validation = runner.run(abortController.signal);
    await vi.waitFor(() => {
      expect(validationSignal).toBeDefined();
    });
    abortController.abort();

    await expect(validation).rejects.toMatchObject({ name: 'AbortError' });
    expect(validationSignal?.aborted).toBe(true);
    resolveValidation?.({ valid: true });
  });
});
