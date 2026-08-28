import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { createFieldController } from '../../src/fields/create-field-controller.js';
import { defineCustomField } from '../../src/fields/custom-field.js';

interface Values {
  readonly tags: readonly string[];
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('custom field controller', () => {
  it('combines an editor-owned shell with consumer-owned widget behavior', async () => {
    const destroy = vi.fn();
    const notifyUserChange = vi.fn();
    const configuredValidation = vi.fn((value: readonly string[]) =>
      value.includes('blocked')
        ? { message: 'Remove the blocked tag.', valid: false }
        : { valid: true },
    );
    const configuredChange = vi.fn();
    const lifecycleAbortController = new AbortController();
    let currentValue: readonly string[] = [];
    let isRequired = false;
    let receivedLocale: string | undefined;
    let receivedSignal: AbortSignal | undefined;
    let triggerUserChange: (() => void) | undefined;
    const definition = defineCustomField<readonly string[], { readonly limit: number }>({
      createController: (options, context) => {
        const control = document.createElement('div');
        control.tabIndex = 0;
        receivedLocale = context.language.locale;
        receivedSignal = context.signal;
        triggerUserChange = context.onUserChange;
        return {
          control,
          destroy,
          focus: () => {
            control.focus();
          },
          getValue: () => currentValue,
          setDisabled: (disabled) => {
            control.dataset['disabled'] = String(disabled);
          },
          setReadOnly: (readOnly) => {
            control.dataset['readOnly'] = String(readOnly);
          },
          setRequired: (required) => {
            isRequired = required;
          },
          setValue: (value) => {
            currentValue = value;
          },
          validate: () =>
            isRequired && currentValue.length === 0
              ? { message: `Choose up to ${String(options.limit)} tags.`, valid: false }
              : { valid: true },
        };
      },
    });
    const config = definition.field<Values>({
      className: 'consumer-field',
      description: 'Choose useful labels.',
      label: 'Tags',
      name: 'tags',
      onChange: configuredChange,
      options: { limit: 3 },
      required: true,
      validate: configuredValidation,
    });
    const controller = createFieldController(
      config,
      'custom-tags',
      ENGLISH_LANGUAGE,
      notifyUserChange,
      undefined,
      lifecycleAbortController.signal,
    );
    document.body.append(controller.element);
    const control = controller.element.querySelector<HTMLElement>(
      '.alteditor-lite-field__control',
    );
    const label = controller.element.querySelector<HTMLLabelElement>('label');
    const error = controller.element.querySelector<HTMLElement>(
      '.alteditor-lite-field__error',
    );

    expect(receivedLocale).toBe('en');
    expect(receivedSignal).toBe(lifecycleAbortController.signal);
    expect(controller.element.classList.contains('consumer-field')).toBe(true);
    expect(label?.htmlFor).toBe('custom-tags');
    expect(control?.getAttribute('aria-labelledby')).toBe('custom-tags-label');
    expect(control?.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['custom-tags-description', 'custom-tags-error']),
    );
    expect(control?.getAttribute('aria-required')).toBe('true');

    expect(
      await controller.validateCustom({ tags: [] }, new AbortController().signal),
    ).toEqual({ message: 'Choose up to 3 tags.', valid: false });
    expect(configuredValidation).not.toHaveBeenCalled();

    controller.setValue(['blocked']);
    expect(await Promise.resolve(controller.getValue())).toEqual(['blocked']);
    expect(
      await controller.validateCustom(
        { tags: ['blocked'] },
        new AbortController().signal,
      ),
    ).toEqual({ message: 'Remove the blocked tag.', valid: false });
    expect(configuredValidation).toHaveBeenCalledOnce();

    controller.setDisabled(true);
    controller.setReadOnly(true);
    expect(control?.getAttribute('aria-disabled')).toBe('true');
    expect(control?.getAttribute('aria-readonly')).toBe('true');
    controller.showError('Review this value.');
    expect(control?.getAttribute('aria-invalid')).toBe('true');
    expect(error?.textContent).toBe('Review this value.');
    controller.clearError();
    expect(control?.hasAttribute('aria-invalid')).toBe(false);

    await controller.runOnChange({ tags: ['blocked'] }, new AbortController().signal);
    expect(configuredChange).toHaveBeenCalledOnce();
    triggerUserChange?.();
    expect(notifyUserChange).toHaveBeenCalledOnce();

    lifecycleAbortController.abort();
    controller.destroy();
    controller.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(controller.element.isConnected).toBe(false);
  });
});
