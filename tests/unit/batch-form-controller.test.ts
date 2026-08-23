import { afterEach, describe, expect, it } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { BatchEditorFormController } from '../../src/form/batch-form-controller.js';

import type { FieldConfig } from '../../src/fields/field-config.js';

interface BatchFormValues {
  readonly attachment: string | null;
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
});
