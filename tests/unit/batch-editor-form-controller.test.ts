import { afterEach, describe, expect, it, vi } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { isChoiceFieldController } from '../../src/fields/field-controller.js';
import { BatchEditorFormController } from '../../src/form/batch-editor-form-controller.js';

import type { FieldChangeContext, FieldConfig } from '../../src/fields/field-config.js';
import type { FieldValidationResult } from '../../src/fields/field-controller.js';
import type { FormDependencies } from '../../src/form/form-dependency.js';

interface BatchFormValues {
  readonly attachment: string | null;
  readonly department?: string;
  readonly email: string;
  readonly office: string;
  readonly token: string;
}

const fields = [
  { label: 'Office', name: 'office', type: 'text' },
  { label: 'Email', name: 'email', type: 'email', unique: true },
  {
    encoding: 'data-url',
    label: 'Attachment',
    name: 'attachment',
    type: 'file',
  },
  { name: 'token', type: 'hidden' },
] satisfies readonly FieldConfig<BatchFormValues>[];

let activeForm: BatchEditorFormController<BatchFormValues> | undefined;

afterEach(() => {
  activeForm?.destroy();
  activeForm = undefined;
  document.body.replaceChildren();
});

function createForm(
  originals: readonly Readonly<BatchFormValues>[],
): BatchEditorFormController<BatchFormValues> {
  activeForm = new BatchEditorFormController(
    fields,
    originals,
    'batch-form-test',
    ENGLISH_LANGUAGE,
  );
  document.body.append(activeForm.element);
  return activeForm;
}

function batchField(name: keyof BatchFormValues): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-alteditor-lite-batch-field="${name}"]`,
  );
  if (element === null) {
    throw new Error(`Expected batch field "${name}".`);
  }
  return element;
}

describe('BatchEditorFormController', () => {
  it('validates common overrides on blur and preserves submission ownership', async () => {
    const requests: {
      signal: AbortSignal;
      resolve: (result: FieldValidationResult) => void;
    }[] = [];
    activeForm = new BatchEditorFormController<BatchFormValues>(
      [
        {
          label: 'Office',
          name: 'office',
          type: 'text',
          validateOn: 'blur',
          validate: (_value, { signal }) =>
            new Promise<FieldValidationResult>((resolve) => {
              requests.push({ resolve, signal });
            }),
        },
      ],
      [{ office: 'Tokyo' }, { office: 'Osaka' }],
      'batch-blur-validation',
      ENGLISH_LANGUAGE,
    );
    const form = activeForm;
    document.body.append(form.element);
    const field = form.getField('office');
    const input = field?.element.querySelector('input');
    if (field === null || input === null || input === undefined) {
      throw new Error('Expected an office input.');
    }
    const blur = (): void => {
      input.dispatchEvent(
        new FocusEvent('focusout', {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    };
    blur();
    await Promise.resolve();
    expect(requests).toHaveLength(0);

    field.setValue('Seoul');
    blur();
    await vi.waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(field.element.getAttribute('aria-busy')).toBe('true');
    field.setValue('Busan');
    expect(requests[0]?.signal.aborted).toBe(true);
    blur();
    await vi.waitFor(() => {
      expect(requests).toHaveLength(2);
    });

    const submission = form.validateForSubmission(new AbortController().signal);
    await vi.waitFor(() => {
      expect(requests).toHaveLength(3);
    });
    expect(requests[1]?.signal.aborted).toBe(true);
    blur();
    requests[2]?.resolve({ message: 'The office is unavailable.', valid: false });
    await expect(submission).resolves.toMatchObject({ valid: false });
    requests[0]?.resolve({ message: 'Old result.', valid: false });
    requests[1]?.resolve({ valid: true });
    await Promise.resolve();
    expect(requests).toHaveLength(3);
    expect(field.element.textContent).toContain('The office is unavailable.');
    expect(field.element.hasAttribute('aria-busy')).toBe(false);

    form.showSubmissionError(
      new AltEditorLiteError({
        fieldErrors: { office: 'The office is reserved.' },
        message: 'The request could not be saved.',
        retryable: true,
      }),
    );
    input.value = 'Kyoto';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await form.collectChanges();
    expect(field.element.textContent).toContain('The office is reserved.');

    blur();
    await vi.waitFor(() => {
      expect(requests).toHaveLength(4);
    });
    form.destroy();
    expect(requests[3]?.signal.aborted).toBe(true);
    requests[3]?.resolve({ message: 'Closed result.', valid: false });
    await Promise.resolve();
    expect(field.element.isConnected).toBe(false);
  });

  it('removes an individually destroyed field from the active form', () => {
    const form = createForm([
      {
        attachment: null,
        email: 'one@example.test',
        office: 'Tokyo',
        token: 'one',
      },
      {
        attachment: null,
        email: 'two@example.test',
        office: 'Osaka',
        token: 'two',
      },
    ]);
    const officeWrapper = batchField('office');

    form.getField('office')?.destroy();

    expect(officeWrapper.isConnected).toBe(false);
    expect(form.getField('office')).toBeNull();
  });

  it('requires a value change before a mixed field becomes an override', async () => {
    const form = createForm([
      {
        attachment: null,
        email: 'one@example.test',
        office: 'Tokyo',
        token: 'one',
      },
      {
        attachment: null,
        email: 'two@example.test',
        office: 'Osaka',
        token: 'two',
      },
    ]);
    const officeField = batchField('office');
    const setValueButton = officeField.querySelector<HTMLButtonElement>(
      '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
    );
    const officeInput = officeField.querySelector<HTMLInputElement>('input');

    expect(officeField.textContent).toContain('Multiple values');
    expect(form.getField('office')?.element.hidden).toBe(true);
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });

    setValueButton?.click();
    expect(form.getField('office')?.element.hidden).toBe(false);
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });

    if (officeInput !== null) {
      officeInput.value = 'Seoul';
      officeInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await expect(form.collectChanges()).resolves.toMatchObject({
      changedFields: ['office'],
      changes: { office: 'Seoul' },
    });

    officeField
      .querySelector<HTMLButtonElement>(':scope > .alteditor-lite-batch-field__action')
      ?.click();
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });
    expect(officeField.textContent).toContain('Multiple values');
  });

  it('does not report a common field changed when it returns to its baseline', async () => {
    const form = createForm([
      {
        attachment: null,
        email: 'one@example.test',
        office: 'Tokyo',
        token: 'one',
      },
      {
        attachment: null,
        email: 'two@example.test',
        office: 'Tokyo',
        token: 'two',
      },
    ]);

    form.getField('office')?.setValue('Seoul');
    await expect(form.collectChanges()).resolves.toMatchObject({
      changes: { office: 'Seoul' },
    });

    form.getField('office')?.setValue('Tokyo');
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });
  });

  it('keeps unique, file, and hidden values out of batch changes', async () => {
    const form = createForm([
      {
        attachment: null,
        email: 'one@example.test',
        office: 'Tokyo',
        token: 'one',
      },
      {
        attachment: null,
        email: 'two@example.test',
        office: 'Osaka',
        token: 'two',
      },
    ]);

    const email = form.getField('email');
    const attachment = form.getField('attachment');
    if (email === null || attachment === null) {
      throw new Error('Expected restricted batch fields.');
    }
    email.setValue('shared@example.test');
    attachment.setValue('data:text/plain;base64,dGVzdA==');

    expect(email.isReadOnly()).toBe(true);
    await expect(email.validate()).resolves.toMatchObject({
      message: ENGLISH_LANGUAGE.batchEdit.uniqueRestriction,
      valid: false,
    });
    await expect(attachment.validate()).resolves.toMatchObject({
      message: ENGLISH_LANGUAGE.batchEdit.fileRestriction,
      valid: false,
    });
    batchField('email')
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    expect(email.element.hidden).toBe(true);
    expect(batchField('attachment').textContent).toContain(
      'File uploads cannot be modified',
    );
    expect(form.getField('token')).toBeNull();
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });
  });

  it('validates overridden fields once and form values for every record', async () => {
    const validateOffice = vi.fn(() => ({ valid: true }) as const);
    const validateForm = vi.fn((values: Readonly<Partial<BatchFormValues>>) => ({
      fieldErrors: { office: `Office ${values.office ?? ''} is unavailable.` },
      valid: false as const,
    }));
    const validatingFields = [
      {
        label: 'Office',
        name: 'office',
        type: 'text',
        validate: validateOffice,
      },
      { label: 'Email', name: 'email', type: 'email' },
      { name: 'token', type: 'hidden' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    const form = new BatchEditorFormController<BatchFormValues>(
      validatingFields,
      [
        {
          attachment: null,
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'two@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-validation-test',
      ENGLISH_LANGUAGE,
      undefined,
      validateForm,
    );
    activeForm = form;
    form.getField('office')?.setValue('Seoul');

    const result = await form.validateForSubmission(new AbortController().signal);

    expect(result).toMatchObject({
      error: {
        fieldErrors: { office: 'Office Seoul is unavailable.' },
      },
      valid: false,
    });
    expect(validateOffice).toHaveBeenCalledOnce();
    expect(validateForm).toHaveBeenCalledTimes(2);
    expect(validateForm.mock.calls.map(([values]) => values)).toEqual([
      {
        email: 'one@example.test',
        office: 'Seoul',
        token: 'one',
      },
      {
        email: 'two@example.test',
        office: 'Seoul',
        token: 'two',
      },
    ]);
  });

  it('resolves logical dependencies once and invokes one change callback', async () => {
    const commonResolver = vi.fn(() => ({}));
    const mixedResolver = vi.fn((office: string) => ({
      department: { value: `${office} team` },
    }));
    const onChange =
      vi.fn<(value: string, context: FieldChangeContext<BatchFormValues>) => void>();
    const dependencyFields = [
      { label: 'Office', name: 'office', onChange, type: 'text' },
      { label: 'Department', name: 'department', type: 'text' },
      { label: 'Email', name: 'email', type: 'email' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    const dependencies = {
      email: commonResolver,
      office: mixedResolver,
    } satisfies FormDependencies<BatchFormValues>;
    activeForm = new BatchEditorFormController<BatchFormValues>(
      dependencyFields,
      [
        {
          attachment: null,
          department: 'Sales',
          email: 'shared@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          department: 'Sales',
          email: 'shared@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-dependency-test',
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
      dependencies,
    );
    document.body.append(activeForm.element);

    await activeForm.initializeDependencies();
    expect(commonResolver).toHaveBeenCalledOnce();
    expect(mixedResolver).not.toHaveBeenCalled();

    const officeField = batchField('office');
    officeField
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = officeField.querySelector<HTMLInputElement>('input');
    if (input !== null) {
      input.value = 'Seoul';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const collected = await activeForm.collectChanges();

    expect(mixedResolver).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[1].values).toMatchObject({
      department: 'Seoul team',
      email: 'shared@example.test',
      office: 'Seoul',
    });
    expect(collected.changes).toEqual({
      department: 'Seoul team',
      office: 'Seoul',
    });
  });

  it('rejects dependency values for unique fields', async () => {
    const dependencyFields = [
      { label: 'Office', name: 'office', type: 'text' },
      { label: 'Email', name: 'email', type: 'email', unique: true },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    const dependencies = {
      office: () => ({ email: { value: 'shared@example.test' } }),
    } satisfies FormDependencies<BatchFormValues>;
    activeForm = new BatchEditorFormController<BatchFormValues>(
      dependencyFields,
      [
        {
          attachment: null,
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'two@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-restriction-test',
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
      dependencies,
    );
    document.body.append(activeForm.element);
    await activeForm.initializeDependencies();

    const officeField = batchField('office');
    officeField
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = officeField.querySelector<HTMLInputElement>('input');
    if (input !== null) {
      input.value = 'Seoul';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    await expect(activeForm.collectChanges()).resolves.toMatchObject({
      changes: { office: 'Seoul' },
    });
    await expect(
      activeForm.validateForSubmission(new AbortController().signal),
    ).resolves.toMatchObject({ valid: false });
    expect(batchField('email').textContent).toContain('Unique fields cannot be assigned');
  });

  it('records a normalized dependency failure and clears it after a successful retry', async () => {
    let shouldFail = true;
    const onDependencyError = vi.fn();
    const dependencyFields = [
      { label: 'Office', name: 'office', type: 'text' },
      { label: 'Department', name: 'department', type: 'text' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    const dependencies = {
      office: () => {
        if (shouldFail) {
          throw new Error('Directory lookup failed.');
        }
        return { department: { value: 'Recovered' } };
      },
    } satisfies FormDependencies<BatchFormValues>;
    activeForm = new BatchEditorFormController<BatchFormValues>(
      dependencyFields,
      [
        {
          attachment: null,
          department: 'Sales',
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          department: 'Sales',
          email: 'two@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-dependency-retry-test',
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
      dependencies,
      onDependencyError,
    );
    document.body.append(activeForm.element);
    const officeField = batchField('office');
    officeField
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = officeField.querySelector<HTMLInputElement>('input');
    if (input === null) {
      throw new Error('Expected an office input.');
    }

    input.value = 'Seoul';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await activeForm.collectChanges();

    expect(onDependencyError).toHaveBeenCalledWith(
      'office',
      expect.objectContaining({ message: ENGLISH_LANGUAGE.errors.generic }),
    );
    await expect(
      activeForm.validateForSubmission(new AbortController().signal),
    ).resolves.toMatchObject({ valid: false });

    shouldFail = false;
    input.value = 'Busan';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await expect(activeForm.collectChanges()).resolves.toMatchObject({
      changes: { department: 'Recovered', office: 'Busan' },
    });
    await expect(
      activeForm.validateForSubmission(new AbortController().signal),
    ).resolves.toMatchObject({ valid: true });
  });

  it('treats an option-only dependency result as a shared value change when needed', async () => {
    const choiceFields = [
      {
        label: 'Office',
        name: 'office',
        options: [
          { label: 'Tokyo', value: 'Tokyo' },
          { label: 'Seoul', value: 'Seoul' },
        ],
        type: 'select',
      },
      { label: 'Email', name: 'email', type: 'email' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    activeForm = new BatchEditorFormController<BatchFormValues>(
      choiceFields,
      [
        {
          attachment: null,
          email: 'shared@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'shared@example.test',
          office: 'Tokyo',
          token: 'two',
        },
      ],
      'batch-choice-dependency-test',
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
      {
        email: () => ({
          office: { options: [{ label: 'Seoul', value: 'Seoul' }] },
        }),
      },
    );
    document.body.append(activeForm.element);

    await activeForm.initializeDependencies();

    const office = activeForm.getField('office');
    if (office === null || !isChoiceFieldController(office)) {
      throw new Error('Expected an office choice field.');
    }
    expect(office.getOptions()).toEqual([{ label: 'Seoul', value: 'Seoul' }]);
    await expect(office.getValue()).resolves.toBeUndefined();
    const collected = await activeForm.collectChanges();
    expect(collected.changedFields).toEqual(['office']);
    expect(Object.hasOwn(collected.changes, 'office')).toBe(true);
  });

  it('aggregates native, custom, and record-level validation messages', async () => {
    const validateDepartment = vi.fn(() => ({ valid: false }) as const);
    const validateForm = vi.fn(
      () =>
        ({
          message: 'The selected records cannot share these values.',
          valid: false,
        }) as const,
    );
    const validationFields = [
      { label: 'Office', name: 'office', required: true, type: 'text' },
      {
        label: 'Department',
        name: 'department',
        type: 'text',
        validate: validateDepartment,
      },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    activeForm = new BatchEditorFormController<BatchFormValues>(
      validationFields,
      [
        {
          attachment: null,
          department: 'Sales',
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          department: 'Sales',
          email: 'two@example.test',
          office: 'Tokyo',
          token: 'two',
        },
      ],
      'batch-aggregate-validation-test',
      ENGLISH_LANGUAGE,
      undefined,
      validateForm,
    );
    document.body.append(activeForm.element);
    activeForm.getField('office')?.setValue('');
    activeForm.getField('department')?.setValue('Blocked');

    const result = await activeForm.validateForSubmission(new AbortController().signal);

    expect(result).toMatchObject({
      error: {
        fieldErrors: {
          department: ENGLISH_LANGUAGE.validation.invalid,
        },
        message: 'The selected records cannot share these values.',
      },
      valid: false,
    });
    if (result.valid) {
      throw new Error('Expected batch validation to fail.');
    }
    expect(result.error.fieldErrors).toHaveProperty('office');
    expect(validateDepartment).toHaveBeenCalledOnce();
    expect(validateForm).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toContain('The selected records cannot share these values.');
  });

  it('accepts shared changes after every effective record passes validation', async () => {
    const validateForm = vi.fn(() => ({ valid: true }) as const);
    const validationFields = [
      { label: 'Office', name: 'office', type: 'text' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    activeForm = new BatchEditorFormController<BatchFormValues>(
      validationFields,
      [
        {
          attachment: null,
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'two@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-valid-records-test',
      ENGLISH_LANGUAGE,
      undefined,
      validateForm,
    );
    activeForm.getField('office')?.setValue('Seoul');

    await expect(
      activeForm.validateForSubmission(new AbortController().signal),
    ).resolves.toMatchObject({
      changedFields: ['office'],
      changes: { office: 'Seoul' },
      valid: true,
    });
    expect(validateForm).toHaveBeenCalledTimes(2);
  });

  it('preserves public field state across rebase and supports idempotent cleanup', async () => {
    const template = document.createElement('template');
    template.innerHTML =
      '<section><div data-alteditor-lite-field="office"></div></section>';
    const lifecycleFields = [
      { label: 'Office', name: 'office', type: 'text' },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    const form = new BatchEditorFormController<BatchFormValues>(
      lifecycleFields,
      [
        {
          attachment: null,
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'two@example.test',
          office: 'Tokyo',
          token: 'two',
        },
      ],
      'batch-lifecycle-test',
      ENGLISH_LANGUAGE,
      template,
    );
    activeForm = form;
    document.body.append(form.element);
    const office = form.getField('office');
    if (office === null) {
      throw new Error('Expected an office field.');
    }

    office.setDisabled(true);
    office.setValue('Seoul');
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });
    office.setDisabled(false);
    office.setValue('Seoul');
    await expect(form.collectChanges()).resolves.toMatchObject({
      changes: { office: 'Seoul' },
    });
    batchField('office')
      .querySelector<HTMLButtonElement>(':scope > .alteditor-lite-batch-field__action')
      ?.click();
    await expect(form.collectChanges()).resolves.toMatchObject({ changes: {} });

    form.rebase([{ office: 'Osaka' }, { office: 'Osaka' }]);
    await expect(office.getValue()).resolves.toBe('Osaka');
    form.setBusy(true);
    expect(form.element.inert).toBe(true);
    form.showSubmissionError(
      new AltEditorLiteError({
        fieldErrors: { unavailable: 'An external field is invalid.' },
        message: 'The request is invalid.',
      }),
    );
    form.showSubmissionError(
      new AltEditorLiteError({ message: 'A general request error occurred.' }),
    );
    expect(
      document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toContain('An external field is invalid.');
    form.clearErrors();

    office.destroy();
    office.destroy();
    expect(form.getField('office')).toBeNull();
    form.destroy();
    form.destroy();
    await expect(form.collectChanges()).rejects.toThrow(
      'This AltEditorLite instance has been destroyed.',
    );
  });

  it('surfaces an unexpected batch field change failure', async () => {
    const changeFields = [
      {
        label: 'Office',
        name: 'office',
        onChange: () => {
          throw new Error('Unexpected callback failure.');
        },
        type: 'text',
      },
    ] satisfies readonly FieldConfig<BatchFormValues>[];
    activeForm = new BatchEditorFormController<BatchFormValues>(
      changeFields,
      [
        {
          attachment: null,
          email: 'one@example.test',
          office: 'Tokyo',
          token: 'one',
        },
        {
          attachment: null,
          email: 'two@example.test',
          office: 'Osaka',
          token: 'two',
        },
      ],
      'batch-change-error-test',
      ENGLISH_LANGUAGE,
    );
    document.body.append(activeForm.element);
    const officeField = batchField('office');
    officeField
      .querySelector<HTMLButtonElement>(
        '.alteditor-lite-batch-field__state .alteditor-lite-batch-field__action',
      )
      ?.click();
    const input = officeField.querySelector<HTMLInputElement>('input');
    if (input === null) {
      throw new Error('Expected an office input.');
    }
    input.value = 'Seoul';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await activeForm.collectChanges();

    expect(
      document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toContain('A field change callback failed.');
  });
});
