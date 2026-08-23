import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { BatchEditorFormController } from '../../src/form/batch-form-controller.js';

import type { FieldChangeContext, FieldConfig } from '../../src/fields/field-config.js';
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

    form.getField('email')?.setValue('shared@example.test');
    form.getField('attachment')?.setValue('data:text/plain;base64,dGVzdA==');

    expect(form.getField('email')?.isReadOnly()).toBe(true);
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
});
