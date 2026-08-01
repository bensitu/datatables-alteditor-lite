import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { createRadioFieldController } from '../../src/fields/radio-field-controller.js';
import { createSelectFieldController } from '../../src/fields/select-field-controller.js';

import type {
  FieldChangeContext,
  FieldValidationContext,
  RadioFieldConfig,
  SelectFieldConfig,
} from '../../src/fields/field-config.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';

interface ChoiceValues {
  readonly choice?: string;
  readonly role?: number;
}

const activeControllers = new Set<ManagedFieldController<ChoiceValues>>();

afterEach(() => {
  for (const controller of activeControllers) {
    controller.destroy();
  }
  activeControllers.clear();
  document.body.replaceChildren();
});

function ownController(
  controller: ManagedFieldController<ChoiceValues>,
): ManagedFieldController<ChoiceValues> {
  activeControllers.add(controller);
  document.body.append(controller.element);
  return controller;
}

function createRadio(
  config: RadioFieldConfig<ChoiceValues, string>,
  onUserChange = vi.fn(),
): ManagedFieldController<ChoiceValues> {
  return ownController(
    createRadioFieldController(config, 'choice-radio', 'Choose an option.', onUserChange),
  );
}

function createSelect(
  config: SelectFieldConfig<ChoiceValues, number>,
  onUserChange = vi.fn(),
): ManagedFieldController<ChoiceValues> {
  return ownController(
    createSelectFieldController(config, 'role-select', 'Choose a role.', onUserChange),
  );
}

describe('radio field controller', () => {
  it('round-trips options, callbacks, validation, and error state', async () => {
    const changeCallback =
      vi.fn<
        (value: string | undefined, context: FieldChangeContext<ChoiceValues>) => void
      >();
    const validationCallback = vi.fn(
      (value: string | undefined, context: FieldValidationContext<ChoiceValues>) => {
        void context;
        return value === 'blocked'
          ? { message: 'Blocked choice.', valid: false }
          : { valid: true };
      },
    );
    const controller = createRadio({
      className: 'consumer-field  accented',
      description: 'Choose carefully.',
      label: 'Choice',
      name: 'choice',
      onChange: changeCallback,
      options: [
        { label: 'Allowed', value: 'allowed' },
        { label: 'Blocked', value: 'blocked' },
      ],
      required: true,
      type: 'radio',
      validate: validationCallback,
    });
    const signal = new AbortController().signal;

    expect(controller.element.classList.contains('consumer-field')).toBe(true);
    expect(controller.element.textContent).toContain('Choose carefully.');
    expect(controller.getValue()).toBeUndefined();
    expect(controller.validateNative()).toEqual({
      message: 'Choose an option.',
      valid: false,
    });

    controller.setValue('blocked');
    expect(controller.getValue()).toBe('blocked');
    await expect(
      controller.validateCustom({ choice: 'blocked' }, signal),
    ).resolves.toEqual({ message: 'Blocked choice.', valid: false });
    await controller.runOnChange({ choice: 'blocked' }, signal);
    expect(changeCallback).toHaveBeenCalledWith(
      'blocked',
      expect.objectContaining({ signal }),
    );

    controller.showError('Choice error.');
    expect(controller.element.querySelector('[aria-invalid="true"]')).not.toBeNull();
    controller.clearError();
    expect(controller.element.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(controller.validateNative()).toEqual({ valid: true });
  });

  it('rejects invalid values and preserves option-level disabled state', () => {
    const controller = createRadio({
      label: 'Choice',
      name: 'choice',
      options: [
        { label: 'Allowed', value: 'allowed' },
        { disabled: true, label: 'Disabled', value: 'disabled' },
      ],
      type: 'radio',
    });
    const inputElements = [
      ...controller.element.querySelectorAll<HTMLInputElement>('input'),
    ];

    expect(() => {
      controller.setValue({});
    }).toThrow(EditorConfigurationError);
    expect(() => {
      controller.setValue('missing');
    }).toThrow(EditorConfigurationError);

    controller.setValue('allowed');
    controller.focus();
    expect(document.activeElement).toBe(inputElements[0]);
    controller.setValue(undefined);
    expect(controller.getValue()).toBeUndefined();

    controller.setDisabled(true);
    expect(controller.isDisabled()).toBe(true);
    controller.setDisabled(false);
    expect(inputElements[0]?.disabled).toBe(false);
    expect(inputElements[1]?.disabled).toBe(true);
  });

  it('prevents readonly clicks and handles an empty defensive option list', () => {
    const readonlyController = createRadio({
      label: 'Choice',
      name: 'choice',
      options: [{ label: 'Allowed', value: 'allowed' }],
      readonly: true,
      type: 'radio',
    });
    const inputElement = readonlyController.element.querySelector('input');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    inputElement?.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);

    const emptyController = createRadio({
      label: 'Empty',
      name: 'choice',
      options: [],
      required: true,
      type: 'radio',
      visible: false,
    });
    expect(emptyController.element.hidden).toBe(true);
    expect(emptyController.isDisabled()).toBe(true);
    expect(emptyController.validateNative().valid).toBe(false);
    expect(() => {
      emptyController.focus();
    }).not.toThrow();
  });
});

describe('select field controller', () => {
  it('round-trips typed values and rejects invalid programmatic values', () => {
    const controller = createSelect({
      allowClear: true,
      label: 'Role',
      name: 'role',
      options: [
        { label: 'One', value: 1 },
        { disabled: true, label: 'Two', value: 2 },
      ],
      type: 'select',
    });

    expect(controller.getValue()).toBeUndefined();
    controller.setValue(1);
    expect(controller.getValue()).toBe(1);
    controller.setValue(undefined);
    expect(controller.getValue()).toBeUndefined();
    expect(() => {
      controller.setValue({});
    }).toThrow(EditorConfigurationError);
    expect(() => {
      controller.setValue(3);
    }).toThrow(EditorConfigurationError);
  });

  it('preserves a readonly value across interaction attempts', () => {
    const controller = createSelect({
      allowClear: true,
      label: 'Role',
      name: 'role',
      options: [
        { label: 'One', value: 1 },
        { label: 'Two', value: 2 },
      ],
      readonly: true,
      type: 'select',
    });
    const selectElement = controller.element.querySelector('select');
    if (selectElement === null) {
      throw new Error('Expected a select element.');
    }
    controller.setValue(1);
    const pointerEvent = new Event('pointerdown', { bubbles: true, cancelable: true });
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowDown',
    });
    selectElement.dispatchEvent(pointerEvent);
    selectElement.dispatchEvent(keyEvent);
    selectElement.value = 'option-1';
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));

    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(controller.getValue()).toBe(1);
  });

  it('commits writable changes and runs optional callbacks', async () => {
    const changeCallback =
      vi.fn<
        (value: number | undefined, context: FieldChangeContext<ChoiceValues>) => void
      >();
    const validationCallback = vi.fn(
      (value: number | undefined, context: FieldValidationContext<ChoiceValues>) => {
        void context;
        return value === 2 ? { message: 'Unavailable.', valid: false } : { valid: true };
      },
    );
    const userChange = vi.fn();
    const controller = createSelect(
      {
        allowClear: true,
        attributes: { 'aria-label': 'Role selection' },
        className: 'role-field',
        description: 'Choose one role.',
        label: 'Role',
        name: 'role',
        onChange: changeCallback,
        options: [
          { label: 'One', value: 1 },
          { label: 'Two', value: 2 },
        ],
        type: 'select',
        validate: validationCallback,
      },
      userChange,
    );
    const selectElement = controller.element.querySelector('select');
    if (selectElement === null) {
      throw new Error('Expected a select element.');
    }
    const signal = new AbortController().signal;
    selectElement.value = 'option-1';
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));

    expect(controller.getValue()).toBe(2);
    expect(userChange).toHaveBeenCalledOnce();
    await expect(controller.validateCustom({ role: 2 }, signal)).resolves.toEqual({
      message: 'Unavailable.',
      valid: false,
    });
    await controller.runOnChange({ role: 2 }, signal);
    expect(changeCallback).toHaveBeenCalledWith(2, expect.objectContaining({ signal }));
    expect(controller.element.classList.contains('role-field')).toBe(true);
    expect(selectElement.getAttribute('aria-label')).toBe('Role selection');
  });
});
