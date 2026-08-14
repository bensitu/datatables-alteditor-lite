import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLiteError,
  EditorDestroyedError,
} from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { buildEditorForm } from '../../src/form/build-editor-form.js';

import type { FieldChangeContext, FieldConfig } from '../../src/fields/field-config.js';
import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { FormController } from '../../src/form/form-controller.js';
import type { LocalUniqueValidator } from '../../src/form/validate-editor-form.js';
import type { Api } from 'datatables.net';

interface FormValues {
  readonly profile: {
    readonly name: string;
  };
  readonly age: number | null;
  readonly active: boolean;
  readonly birthDate: string;
  readonly choice: string;
  readonly email: string;
  readonly localDateTime: string;
  readonly meetingTime: string;
  readonly notes: string;
  readonly optionalNumber?: number;
  readonly password: string;
  readonly role: number;
  readonly token: string;
  readonly disabledValue: string;
  readonly omittedValue: string;
}

const changeCallback =
  vi.fn<
    (value: string, context: FieldChangeContext<FormValues>) => void | Promise<void>
  >();
const fields = [
  {
    defaultValue: '',
    label: 'Name',
    name: 'profile.name',
    onChange: changeCallback,
    required: true,
    type: 'text',
    validate: (value: string) =>
      value === 'blocked'
        ? { message: 'This name is blocked.', valid: false }
        : { valid: true },
  },
  {
    defaultValue: null,
    emptyValue: null,
    label: 'Age',
    name: 'age',
    type: 'number',
  },
  {
    defaultValue: false,
    label: 'Active',
    name: 'active',
    readOnly: true,
    type: 'checkbox',
  },
  {
    defaultValue: 'person@example.test',
    label: 'Email',
    name: 'email',
    type: 'email',
  },
  {
    defaultValue: '',
    label: 'Password',
    name: 'password',
    type: 'password',
  },
  {
    defaultValue: '2026-07-31',
    label: 'Birth date',
    name: 'birthDate',
    type: 'date',
  },
  {
    defaultValue: '09:30',
    label: 'Meeting time',
    name: 'meetingTime',
    type: 'time',
  },
  {
    defaultValue: '2026-07-31T09:30',
    label: 'Local date and time',
    name: 'localDateTime',
    type: 'datetime-local',
  },
  {
    defaultValue: 'Notes',
    label: 'Notes',
    name: 'notes',
    rows: 4,
    type: 'textarea',
    visible: false,
  },
  {
    defaultValue: 'second',
    label: 'Choice',
    name: 'choice',
    options: [
      { label: 'First', value: 'first' },
      { label: 'Second', value: 'second' },
    ],
    type: 'radio',
  },
  {
    label: 'Optional number',
    name: 'optionalNumber',
    type: 'number',
  },
  {
    defaultValue: 2,
    label: 'Role',
    name: 'role',
    options: [
      { label: 'One', value: 1 },
      { label: 'Two', value: 2 },
    ],
    type: 'select',
  },
  {
    defaultValue: 'secret',
    name: 'token',
    type: 'hidden',
  },
  {
    defaultValue: 'disabled',
    disabled: true,
    label: 'Disabled',
    name: 'disabledValue',
    type: 'text',
  },
  {
    editable: false,
    label: 'Omitted',
    name: 'omittedValue',
    type: 'text',
  },
] satisfies readonly FieldConfig<FormValues>[];

let activeForm: FormController<FormValues> | undefined;

afterEach(() => {
  activeForm?.destroy();
  activeForm = undefined;
  changeCallback.mockReset();
  document.body.replaceChildren();
});

function createForm(
  validateUnique?: LocalUniqueValidator<FormValues>,
): FormController<FormValues> {
  activeForm = buildEditorForm<FormValues>(
    fields,
    'form-test',
    ENGLISH_LANGUAGE,
    validateUnique,
  );
  document.body.append(activeForm.element);
  return activeForm;
}

describe('FormController', () => {
  it('collects normalized nested values and omits disabled fields', async () => {
    const form = createForm();
    form.getField('profile.name')?.setValue('Ada');

    await expect(form.collect()).resolves.toEqual({
      active: false,
      age: null,
      birthDate: '2026-07-31',
      choice: 'second',
      email: 'person@example.test',
      localDateTime: '2026-07-31T09:30',
      meetingTime: '09:30',
      notes: 'Notes',
      password: '',
      profile: { name: 'Ada' },
      role: 2,
      token: 'secret',
    });
    expect(form.getField('omittedValue')).toBeNull();
  });

  it('populates nested values and preserves numeric select values', async () => {
    const form = createForm();
    form.populate({
      active: true,
      age: 37,
      profile: { name: 'Grace' },
      role: 1,
    });

    await expect(form.collect()).resolves.toMatchObject({
      active: true,
      age: 37,
      profile: { name: 'Grace' },
      role: 1,
    });
    expect(await Promise.resolve(form.getField('role')?.getValue())).toBe(1);
  });

  it('applies explicit undefined values without clearing absent defaults', async () => {
    const form = createForm();

    form.populate({});
    expect(await Promise.resolve(form.getField('role')?.getValue())).toBe(2);

    form.populate({ role: undefined } as unknown as Partial<FormValues>);
    expect(await Promise.resolve(form.getField('role')?.getValue())).toBeUndefined();
    await expect(form.collect()).resolves.not.toHaveProperty('role');
  });

  it('runs native constraints before custom validation and focuses errors', async () => {
    const form = createForm();
    const nameField = form.getField('profile.name');

    const nativeValidationResult = await form.validate();
    expect(nativeValidationResult.valid).toBe(false);
    expect(typeof nativeValidationResult.fieldErrors['profile.name']).toBe('string');
    expect(nameField?.element.querySelector('[aria-invalid="true"]')).not.toBeNull();

    nameField?.setValue('blocked');
    await expect(form.validate()).resolves.toEqual({
      fieldErrors: {
        'profile.name': 'This name is blocked.',
      },
      valid: false,
    });
  });

  it('maps configured errors and promotes unknown paths to submission text', () => {
    const form = createForm();
    form.showSubmissionError(
      new AltEditorLiteError({
        fieldErrors: {
          'profile.name': 'Known field error.',
          'unknown.path': 'Unknown field error.',
        },
        message: 'Submission failed.',
      }),
    );

    expect(
      form.getField('profile.name')?.element.querySelector('.alteditor-lite-field__error')
        ?.textContent,
    ).toBe('Known field error.');
    expect(
      form.element.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toBe('Submission failed. Unknown field error.');

    form.showSubmissionError(
      new AltEditorLiteError({
        fieldErrors: { 'profile.name': 'Replacement field error.' },
        message: 'Replacement submission failed.',
      }),
    );
    expect(
      form.element.querySelector<HTMLElement>('.alteditor-lite-form__submission-error')
        ?.hidden,
    ).toBe(true);
  });

  it('runs onChange with a live signal and ignores no owned listeners after destroy', async () => {
    const form = createForm();
    const inputElement = form.getField('profile.name')?.element.querySelector('input');
    inputElement?.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(changeCallback).toHaveBeenCalledOnce();
    });
    const callbackContext = changeCallback.mock.calls[0]?.[1];
    expect(callbackContext?.signal).toBeInstanceOf(AbortSignal);

    form.destroy();
    inputElement?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changeCallback).toHaveBeenCalledOnce();
    expect(() => form.getField('profile.name')).toThrow(EditorDestroyedError);
    expect(() => {
      form.destroy();
    }).not.toThrow();
    activeForm = undefined;
  });

  it('cancels an older onChange only when the same field changes again', async () => {
    let firstSignal: AbortSignal | undefined;
    let finishFirstChange: (() => void) | undefined;
    changeCallback.mockImplementationOnce(
      (_value, context) =>
        new Promise<void>((resolve) => {
          firstSignal = context.signal;
          finishFirstChange = resolve;
        }),
    );
    const form = createForm();
    const nameInput = form
      .getField('profile.name')
      ?.element.querySelector<HTMLInputElement>('input');
    const emailInput = form
      .getField('email')
      ?.element.querySelector<HTMLInputElement>('input');

    nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(firstSignal).toBeDefined();
    });
    emailInput?.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    expect(firstSignal?.aborted).toBe(false);

    nameInput?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(firstSignal?.aborted).toBe(true);
    finishFirstChange?.();
  });

  it('marks the form busy without changing collected values', async () => {
    const form = createForm();
    form.getField('profile.name')?.setValue('Busy');
    form.setBusy(true);

    expect(form.element.inert).toBe(true);
    await expect(form.collect()).resolves.toMatchObject({
      profile: { name: 'Busy' },
    });

    form.setBusy(false);
    expect(form.element.inert).toBe(false);
  });

  it('keeps a readonly checkbox collectible without allowing mutation', async () => {
    const form = createForm();
    const checkboxElement = form
      .getField('active')
      ?.element.querySelector<HTMLInputElement>('input');

    checkboxElement?.click();

    expect(checkboxElement?.checked).toBe(false);
    await expect(form.collect()).resolves.toMatchObject({
      active: false,
    });
  });

  it('validates one field through native, custom, and local unique rules', async () => {
    const form = createForm((values) =>
      values.profile?.name === 'duplicate'
        ? { 'profile.name': 'Name already exists.' }
        : {},
    );
    const nameField = form.getField('profile.name');

    await expect(nameField?.validate()).resolves.toMatchObject({ valid: false });
    nameField?.setValue('blocked');
    await expect(nameField?.validate()).resolves.toEqual({
      message: 'This name is blocked.',
      valid: false,
    });
    nameField?.setValue('duplicate');
    await expect(nameField?.validate()).resolves.toEqual({
      message: 'Name already exists.',
      valid: false,
    });
    nameField?.setValue('available');
    await expect(nameField?.validate()).resolves.toEqual({ valid: true });
  });

  it('rejects an unexpected field validator failure', async () => {
    const form = buildEditorForm<FormValues>(
      [
        {
          defaultValue: 'Ready',
          label: 'Name',
          name: 'profile.name',
          type: 'text',
          validate: () => {
            throw new Error('Field validator failed.');
          },
        },
      ],
      'field-validator-failure',
      ENGLISH_LANGUAGE,
    );
    activeForm = form;
    document.body.append(form.element);
    const field = form.getField('profile.name');

    await expect(field?.validate()).rejects.toThrow('Field validator failed.');
    expect(
      field?.element.querySelector('.alteditor-lite-field__error')?.textContent,
    ).toBe(ENGLISH_LANGUAGE.validation.invalid);
  });

  it('keeps submission validation active when field validation begins', async () => {
    let releaseSubmissionValidation:
      ((result: FieldValidationResult) => void) | undefined;
    const pendingSubmissionValidation = new Promise<FieldValidationResult>((resolve) => {
      releaseSubmissionValidation = resolve;
    });
    let validationCount = 0;
    const form = buildEditorForm<FormValues>(
      [
        {
          defaultValue: 'Ready',
          label: 'Name',
          name: 'profile.name',
          type: 'text',
          validate: () => {
            validationCount += 1;
            return validationCount === 1 ? pendingSubmissionValidation : { valid: true };
          },
        },
      ],
      'submission-field-validation',
      ENGLISH_LANGUAGE,
    );
    activeForm = form;
    document.body.append(form.element);
    const operationAbortController = new AbortController();
    const submission = form.validateForSubmission<Record<string, never>>(
      operationAbortController.signal,
      undefined,
      {
        mode: 'dialog',
        operation: 'create',
        table: {} as Api<Record<string, never>>,
      },
    );

    await vi.waitFor(() => {
      expect(validationCount).toBe(1);
    });
    await expect(form.getField('profile.name')?.validate()).resolves.toEqual({
      valid: true,
    });
    if (releaseSubmissionValidation === undefined) {
      throw new Error('Expected a pending submission validation.');
    }
    releaseSubmissionValidation({ valid: true });

    await expect(submission).resolves.toMatchObject({ valid: true });
    expect(operationAbortController.signal.aborted).toBe(false);
  });

  it('applies public field state through collection, layout, and native controls', async () => {
    const form = createForm();
    const nameField = form.getField('profile.name');
    const input = nameField?.element.querySelector<HTMLInputElement>('input');
    const slot = nameField?.element.parentElement;
    if (
      nameField === null ||
      input === null ||
      input === undefined ||
      slot === null ||
      slot === undefined
    ) {
      throw new Error('Expected a mounted text field.');
    }

    expect(nameField.getValue()).toBeInstanceOf(Promise);
    expect(nameField.isVisible()).toBe(true);
    nameField.setVisible(false);
    expect(slot.hidden).toBe(true);
    nameField.setValue('Collected while hidden');
    await expect(form.collect()).resolves.toMatchObject({
      profile: { name: 'Collected while hidden' },
    });
    nameField.setVisible(true);

    nameField.setDisabled(true);
    expect(nameField.isDisabled()).toBe(true);
    await expect(form.collect()).resolves.not.toHaveProperty('profile');
    nameField.setDisabled(false);

    nameField.setReadOnly(true);
    expect(nameField.isReadOnly()).toBe(true);
    expect(input.readOnly).toBe(true);
    nameField.setReadOnly(false);

    nameField.setRequired(false);
    expect(nameField.isRequired()).toBe(false);
    expect(input.required).toBe(false);
    nameField.setValue('');
    await expect(nameField.validate()).resolves.toEqual({ valid: true });
    nameField.setRequired(true);
    await expect(nameField.validate()).resolves.toMatchObject({ valid: false });
  });

  it('caches field facades and removes explicitly destroyed fields', async () => {
    const form = createForm();
    const nameField = form.getField('profile.name');

    expect(form.getField('profile.name')).toBe(nameField);
    nameField?.setValue('Temporary');
    nameField?.showError('Temporary error.');
    expect(nameField?.element.querySelector('[aria-invalid="true"]')).not.toBeNull();
    nameField?.clearError();
    nameField?.focus();
    expect(document.activeElement).toBe(nameField?.element.querySelector('input'));
    nameField?.setDisabled(true);
    await expect(form.collect()).resolves.not.toHaveProperty('profile');
    nameField?.setDisabled(false);

    nameField?.destroy();
    nameField?.destroy();
    expect(form.getField('profile.name')).toBeNull();
  });

  it('reports field change callback failures beside the changed field', async () => {
    const form = createForm();
    const inputElement = form.getField('profile.name')?.element.querySelector('input');
    const submissionError = form.element.querySelector<HTMLElement>(
      '.alteditor-lite-form__submission-error',
    );
    changeCallback.mockImplementationOnce(() => {
      throw new Error('Consumer failure.');
    });
    inputElement?.dispatchEvent(new Event('input', { bubbles: true }));

    await vi.waitFor(() => {
      expect(
        form
          .getField('profile.name')
          ?.element.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('A field change callback failed.');
    });
    form.clearErrors();
    expect(submissionError?.hidden).toBe(true);

    form.showSubmissionError(
      new AltEditorLiteError({ code: 'FORM', message: 'Form failed.' }),
    );
    expect(submissionError?.textContent).toBe('Form failed.');
    form.clearErrors();

    changeCallback.mockImplementationOnce(() => {
      throw new AltEditorLiteError({ code: 'CHANGE', message: 'Change failed.' });
    });
    inputElement?.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(
        form
          .getField('profile.name')
          ?.element.querySelector('.alteditor-lite-field__error')?.textContent,
      ).toBe('Change failed.');
    });
  });

  it('discards an explicitly superseded field validation result', async () => {
    let releaseFirstValidation: ((result: FieldValidationResult) => void) | undefined;
    const firstValidation = new Promise<FieldValidationResult>((resolve) => {
      releaseFirstValidation = resolve;
    });
    let validationCount = 0;
    const form = buildEditorForm<FormValues>(
      [
        {
          defaultValue: 'Ready',
          label: 'Name',
          name: 'profile.name',
          type: 'text',
          validate: () => {
            validationCount += 1;
            return validationCount === 1 ? firstValidation : { valid: true };
          },
        },
      ],
      'field-validation',
      ENGLISH_LANGUAGE,
    );
    activeForm = form;
    document.body.append(form.element);
    const field = form.getField('profile.name');

    const supersededValidation = field?.validate();
    await vi.waitFor(() => {
      expect(validationCount).toBe(1);
    });
    await expect(field?.validate()).resolves.toEqual({ valid: true });
    releaseFirstValidation?.({ message: 'Stale result.', valid: false });

    await expect(supersededValidation).resolves.toEqual({ valid: false });
    expect(field?.element.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it('discards a validation result superseded by a newer request', async () => {
    let validationCount = 0;
    let releaseFirstValidation: ((result: FieldValidationResult) => void) | undefined;
    const firstValidation = new Promise<FieldValidationResult>((resolve) => {
      releaseFirstValidation = resolve;
    });
    const concurrentFields = [
      {
        defaultValue: 'Ready',
        label: 'Name',
        name: 'profile.name',
        type: 'text',
        validate: () => {
          validationCount += 1;
          return validationCount === 1 ? firstValidation : { valid: true };
        },
      },
    ] satisfies readonly FieldConfig<FormValues>[];
    const form = buildEditorForm<FormValues>(
      concurrentFields,
      'concurrent-validation',
      ENGLISH_LANGUAGE,
    );
    activeForm = form;
    document.body.append(form.element);

    const supersededValidation = form.validate();
    await vi.waitFor(() => {
      expect(validationCount).toBe(1);
    });
    await expect(form.validate()).resolves.toEqual({
      fieldErrors: {},
      valid: true,
    });
    if (releaseFirstValidation === undefined) {
      throw new Error('Expected a pending validation request.');
    }
    releaseFirstValidation({ valid: true });

    await expect(supersededValidation).resolves.toEqual({
      fieldErrors: {},
      valid: false,
    });
  });
});
