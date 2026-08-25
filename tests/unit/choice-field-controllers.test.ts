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
    createRadioFieldController(
      config,
      'choice-radio',
      'Choose an option.',
      'Choose an option.',
      onUserChange,
    ),
  );
}

function createSelect(
  config: SelectFieldConfig<ChoiceValues, number>,
  onUserChange = vi.fn(),
): ManagedFieldController<ChoiceValues> {
  return ownController(
    createSelectFieldController(
      config,
      'role-select',
      'Choose a role.',
      'Choose a role.',
      onUserChange,
    ),
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
    const groupElement = controller.element.querySelector('[role="radiogroup"]');
    const descriptionElement = controller.element.querySelector(
      '.alteditor-lite-field__description',
    );

    expect(controller.element.classList.contains('consumer-field')).toBe(true);
    expect(controller.element.textContent).toContain('Choose carefully.');
    expect(descriptionElement?.id).toBe('choice-radio-description');
    expect(groupElement?.getAttribute('aria-describedby')).toBe(
      'choice-radio-description choice-radio-error',
    );
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

  it('places the native required constraint on an enabled radio option', () => {
    const controller = createRadio({
      label: 'Choice',
      name: 'choice',
      options: [
        { disabled: true, label: 'Disabled', value: 'disabled' },
        { label: 'Allowed', value: 'allowed' },
      ],
      required: true,
      type: 'radio',
    });
    const inputElements = [
      ...controller.element.querySelectorAll<HTMLInputElement>('input'),
    ];

    expect(inputElements[0]?.required).toBe(false);
    expect(inputElements[1]?.required).toBe(true);
  });

  it('rebuilds radio options while preserving only an exact selection', () => {
    const userChange = vi.fn();
    const controller = createRadio(
      {
        label: 'Choice',
        name: 'choice',
        options: [
          { label: 'Allowed', value: 'allowed' },
          { label: 'Blocked', value: 'blocked' },
        ],
        type: 'radio',
      },
      userChange,
    );
    if (controller.setOptions === undefined || controller.getOptions === undefined) {
      throw new Error('Expected replaceable radio options.');
    }

    controller.setValue('blocked');
    controller.setOptions([
      { label: 'Blocked renamed', value: 'blocked' },
      { label: 'New choice', value: 'new' },
    ]);
    expect(controller.getValue()).toBe('blocked');
    expect(controller.getOptions()[0]?.label).toBe('Blocked renamed');
    expect(controller.element.querySelector('label')?.htmlFor).toBe(
      controller.element.querySelector('input')?.id,
    );

    controller.setOptions([{ label: 'New choice', value: 'new' }]);
    expect(controller.getValue()).toBeUndefined();
    expect(userChange).not.toHaveBeenCalled();
  });

  it('prevents readonly clicks and validates an empty defensive option list', () => {
    const readonlyController = createRadio({
      label: 'Choice',
      name: 'choice',
      options: [{ label: 'Allowed', value: 'allowed' }],
      readOnly: true,
      type: 'radio',
    });
    const inputElement = readonlyController.element.querySelector('input');
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    inputElement?.dispatchEvent(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(true);
    const keydownEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'ArrowRight',
    });
    inputElement?.dispatchEvent(keydownEvent);
    expect(keydownEvent.defaultPrevented).toBe(true);
    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    inputElement?.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);

    const emptyController = createRadio({
      label: 'Empty',
      name: 'choice',
      options: [],
      required: true,
      type: 'radio',
    });
    expect(emptyController.element.hidden).toBe(false);
    expect(emptyController.isDisabled()).toBe(false);
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
    const userChange = vi.fn();
    const controller = createSelect(
      {
        allowClear: true,
        label: 'Role',
        name: 'role',
        options: [
          { label: 'One', value: 1 },
          { label: 'Two', value: 2 },
        ],
        readOnly: true,
        type: 'select',
      },
      userChange,
    );
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
    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    selectElement.dispatchEvent(tabEvent);
    selectElement.value = 'option-1';
    selectElement.dispatchEvent(new Event('change', { bubbles: true }));

    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(controller.getValue()).toBe(1);
    expect(userChange).not.toHaveBeenCalled();
  });

  it('rebuilds select options without dispatching a user change', () => {
    const userChange = vi.fn();
    const controller = createSelect(
      {
        label: 'Role',
        name: 'role',
        options: [
          { label: 'One', value: 1 },
          { label: 'Two', value: 2 },
        ],
        type: 'select',
      },
      userChange,
    );
    if (controller.setOptions === undefined || controller.getOptions === undefined) {
      throw new Error('Expected replaceable select options.');
    }

    controller.setValue(2);
    controller.setOptions([
      { label: 'Two renamed', value: 2 },
      { label: 'Three', value: 3 },
    ]);
    expect(controller.getValue()).toBe(2);
    expect(controller.getOptions()[0]?.label).toBe('Two renamed');

    controller.setOptions([{ label: 'Three', value: 3 }]);
    expect(controller.getValue()).toBeUndefined();
    expect(controller.element.querySelector('select')?.selectedIndex).toBe(-1);
    expect(userChange).not.toHaveBeenCalled();
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
