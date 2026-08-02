import { afterEach, describe, expect, it } from 'vitest';

import { resolveLanguage } from '../../src/core/alt-editor-lite-language.js';
import { buildEditorForm } from '../../src/form/build-editor-form.js';

import type { FieldConfig } from '../../src/fields/field-config.js';
import type { FormController } from '../../src/form/form-controller.js';

interface RequiredFieldValues {
  readonly active: boolean;
  readonly appointmentDate: string;
  readonly email: string;
  readonly name: string;
  readonly notes: string;
  readonly office?: string;
  readonly rank?: number;
  readonly role?: string;
  readonly searchableOffice?: string;
}

const language = resolveLanguage({
  validation: {
    invalid: 'Localized invalid value.',
    required: 'Localized required value.',
  },
});

const requiredFields = [
  { label: 'Name', name: 'name', required: true, type: 'text' },
  { label: 'Email', name: 'email', required: true, type: 'email' },
  { label: 'Rank', name: 'rank', required: true, type: 'number' },
  {
    label: 'Appointment date',
    name: 'appointmentDate',
    required: true,
    type: 'date',
  },
  { label: 'Notes', name: 'notes', required: true, type: 'textarea' },
  { label: 'Active', name: 'active', required: true, type: 'checkbox' },
  {
    allowClear: true,
    label: 'Office',
    name: 'office',
    options: [{ label: 'Tokyo', value: 'tokyo' }],
    required: true,
    type: 'select',
  },
  {
    label: 'Role',
    name: 'role',
    options: [{ label: 'Developer', value: 'developer' }],
    required: true,
    type: 'radio',
  },
  {
    label: 'Searchable office',
    name: 'searchableOffice',
    options: [{ label: 'Tokyo', value: 'tokyo' }],
    required: true,
    type: 'search-select',
  },
] satisfies readonly FieldConfig<RequiredFieldValues>[];

let activeForm: FormController<RequiredFieldValues> | undefined;

afterEach(() => {
  activeForm?.destroy();
  activeForm = undefined;
  document.body.replaceChildren();
});

describe('native field presentation', () => {
  it('uses the configured required message for every required field type', async () => {
    activeForm = buildEditorForm(requiredFields, 'required-fields', language);
    document.body.append(activeForm.element);

    const result = await activeForm.validate();

    expect(result.valid).toBe(false);
    expect(Object.keys(result.fieldErrors)).toHaveLength(requiredFields.length);
    expect(new Set(Object.values(result.fieldErrors))).toEqual(
      new Set(['Localized required value.']),
    );
  });

  it('groups a checkbox before its visible label on one semantic row', () => {
    activeForm = buildEditorForm(
      [{ label: 'Active', name: 'active', type: 'checkbox' }],
      'checkbox-field',
      language,
    );
    document.body.append(activeForm.element);

    const checkboxRow = activeForm
      .getField('active')
      ?.element.querySelector<HTMLLabelElement>('.dt-alteditor-lite-checkbox');

    expect(checkboxRow).not.toBeNull();
    expect(checkboxRow?.firstElementChild).toBeInstanceOf(HTMLInputElement);
    expect(checkboxRow?.lastElementChild?.textContent).toBe('Active');
  });
});
