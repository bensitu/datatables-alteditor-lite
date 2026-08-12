import { afterEach, describe, expect, it } from 'vitest';

import { resolveLanguage } from '../../src/core/alt-editor-lite-language.js';
import { createFieldController } from '../../src/fields/create-field-controller.js';
import { INLINE_FIELD_PRESENTATION } from '../../src/fields/field-controller-presentation.js';
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
  it('keeps inline labels accessible while exposing errors outside the field DOM', () => {
    const controller = createFieldController(
      { label: 'Name', name: 'name', type: 'text' },
      'inline-name',
      language,
      () => undefined,
      INLINE_FIELD_PRESENTATION,
    );
    document.body.append(controller.element);

    controller.showError('Name is unavailable.');

    expect(
      controller.element
        .querySelector('.dt-alteditor-lite-field__label')
        ?.classList.contains('dt-alteditor-lite-visually-hidden'),
    ).toBe(true);
    expect(
      controller.element.querySelector('.dt-alteditor-lite-field__error'),
    ).toBeNull();
    expect(controller.getError?.()).toBe('Name is unavailable.');
    expect(controller.element.querySelector('input')?.getAttribute('aria-invalid')).toBe(
      'true',
    );
    controller.destroy();
  });

  it('uses the configured required message for every required field type', async () => {
    const form = buildEditorForm<RequiredFieldValues>(
      requiredFields,
      'required-fields',
      language,
    );
    activeForm = form;
    document.body.append(form.element);

    const result = await form.validate();

    expect(result.valid).toBe(false);
    expect(Object.keys(result.fieldErrors)).toHaveLength(requiredFields.length);
    expect(new Set(Object.values(result.fieldErrors))).toEqual(
      new Set(['Localized required value.']),
    );
  });

  it('uses the invalid message when a required number has bad input', () => {
    const controller = createFieldController(
      { label: 'Rank', name: 'rank', required: true, type: 'number' },
      'invalid-number',
      language,
      () => undefined,
    );
    const input = controller.element.querySelector<HTMLInputElement>('input');
    if (input === null) {
      throw new Error('Expected a number input.');
    }
    input.value = '1';
    Object.defineProperty(input, 'validity', {
      configurable: true,
      value: { badInput: true, valueMissing: true },
    });
    Object.defineProperty(input, 'checkValidity', {
      configurable: true,
      value: () => false,
    });

    expect(controller.validateNative()).toEqual({
      message: 'Localized invalid value.',
      valid: false,
    });
    controller.destroy();
  });

  it('groups a checkbox before its visible label on one semantic row', () => {
    const form = buildEditorForm<RequiredFieldValues>(
      [{ label: 'Active', name: 'active', type: 'checkbox' }],
      'checkbox-field',
      language,
    );
    activeForm = form;
    document.body.append(form.element);

    const checkboxRow = form
      .getField('active')
      ?.element.querySelector<HTMLLabelElement>('.dt-alteditor-lite-checkbox');

    expect(checkboxRow).not.toBeNull();
    expect(checkboxRow?.firstElementChild).toBeInstanceOf(HTMLInputElement);
    expect(checkboxRow?.lastElementChild?.textContent).toBe('Active');
  });
});
