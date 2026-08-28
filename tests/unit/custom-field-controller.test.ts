import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
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
    let receivedPresentation: string | undefined;
    let receivedSignal: AbortSignal | undefined;
    let validationSignal: AbortSignal | undefined;
    let triggerUserChange: (() => void) | undefined;
    const definition = defineCustomField<readonly string[], { readonly limit: number }>({
      createController: (options, context) => {
        const control = document.createElement('div');
        const input = document.createElement('input');
        control.append(input);
        receivedLocale = context.language.locale;
        receivedPresentation = context.presentation;
        receivedSignal = context.signal;
        triggerUserChange = context.onUserChange;
        return {
          ariaTarget: input,
          control,
          destroy,
          focus: () => {
            input.focus();
          },
          getValue: () => currentValue,
          setDisabled: (disabled) => {
            input.setAttribute('aria-disabled', String(disabled));
          },
          setReadOnly: (readOnly) => {
            input.setAttribute('aria-readonly', String(readOnly));
          },
          setRequired: (required) => {
            isRequired = required;
            input.setAttribute('aria-required', String(required));
          },
          setValue: (value) => {
            currentValue = value;
          },
          validate: (signal) => {
            validationSignal = signal;
            return isRequired && currentValue.length === 0
              ? { message: `Choose up to ${String(options.limit)} tags.`, valid: false }
              : { valid: true };
          },
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
    const ariaTarget = control?.querySelector('input');
    const label = controller.element.querySelector<HTMLLabelElement>('label');
    const error = controller.element.querySelector<HTMLElement>(
      '.alteditor-lite-field__error',
    );

    expect(receivedLocale).toBe('en');
    expect(receivedPresentation).toBe('dialog');
    expect(receivedSignal).toBe(lifecycleAbortController.signal);
    expect(controller.element.classList.contains('consumer-field')).toBe(true);
    expect(label?.htmlFor).toBe('custom-tags');
    expect(ariaTarget?.getAttribute('aria-labelledby')).toBe('custom-tags-label');
    expect(ariaTarget?.getAttribute('aria-describedby')?.split(' ')).toEqual(
      expect.arrayContaining(['custom-tags-description', 'custom-tags-error']),
    );
    expect(ariaTarget?.getAttribute('aria-required')).toBe('true');
    expect(control?.hasAttribute('aria-required')).toBe(false);

    const firstValidationSignal = new AbortController().signal;
    expect(await controller.validateCustom({ tags: [] }, firstValidationSignal)).toEqual({
      message: 'Choose up to 3 tags.',
      valid: false,
    });
    expect(validationSignal).toBe(firstValidationSignal);
    expect(configuredValidation).not.toHaveBeenCalled();

    controller.setValue(['allowed']);
    expect(
      await controller.validateCustom(
        { tags: ['allowed'] },
        new AbortController().signal,
      ),
    ).toEqual({ valid: true });

    controller.setValue(['blocked']);
    expect(await Promise.resolve(controller.getValue())).toEqual(['blocked']);
    expect(
      await controller.validateCustom(
        { tags: ['blocked'] },
        new AbortController().signal,
      ),
    ).toEqual({ message: 'Remove the blocked tag.', valid: false });
    expect(configuredValidation).toHaveBeenCalledTimes(2);

    controller.setDisabled(true);
    controller.setReadOnly(true);
    expect(ariaTarget?.getAttribute('aria-disabled')).toBe('true');
    expect(ariaTarget?.getAttribute('aria-readonly')).toBe('true');
    expect(control?.hasAttribute('aria-disabled')).toBe(false);
    controller.focus();
    expect(document.activeElement).toBe(ariaTarget);
    controller.showError('Review this value.');
    expect(ariaTarget?.getAttribute('aria-invalid')).toBe('true');
    expect(error?.textContent).toBe('Review this value.');
    controller.clearError();
    expect(ariaTarget?.hasAttribute('aria-invalid')).toBe(false);

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

  it('settles adapter validation promptly when its owning work is cancelled', async () => {
    let validationSignal: AbortSignal | undefined;
    let resolveValidation: ((result: { readonly valid: boolean }) => void) | undefined;
    const destroy = vi.fn();
    const lifecycleAbortController = new AbortController();
    const definition = defineCustomField<readonly string[]>({
      createController: () => {
        const control = document.createElement('input');
        return {
          control,
          destroy,
          focus: () => undefined,
          getValue: () => [],
          setDisabled: () => undefined,
          setReadOnly: () => undefined,
          setRequired: () => undefined,
          setValue: () => undefined,
          validate: (signal) => {
            validationSignal = signal;
            return new Promise((resolve) => {
              resolveValidation = resolve;
            });
          },
        };
      },
    });
    const controller = createFieldController(
      definition.field<Values>({ label: 'Tags', name: 'tags' }),
      'cancelled-custom-tags',
      ENGLISH_LANGUAGE,
      () => undefined,
      undefined,
      lifecycleAbortController.signal,
    );
    document.body.append(controller.element);
    const validation = controller.validateCustom({}, lifecycleAbortController.signal);

    lifecycleAbortController.abort();
    controller.destroy();

    await expect(validation).rejects.toMatchObject({ name: 'AbortError' });
    resolveValidation?.({ valid: false });
    await Promise.resolve();
    expect(validationSignal).toBe(lifecycleAbortController.signal);
    expect(destroy).toHaveBeenCalledOnce();
    expect(controller.element.isConnected).toBe(false);
  });

  it('destroys a returned adapter when its runtime contract is invalid', () => {
    const destroy = vi.fn();
    const definition = defineCustomField<readonly string[]>({
      createController: () =>
        ({
          control: document.createElement('input'),
          destroy,
        }) as never,
    });

    expect(() =>
      createFieldController(
        definition.field<Values>({ label: 'Tags', name: 'tags' }),
        'invalid-custom-tags',
        ENGLISH_LANGUAGE,
        () => undefined,
      ),
    ).toThrow(EditorConfigurationError);
    expect(destroy).toHaveBeenCalledOnce();
  });
});
