import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import { ChoiceOptionStore } from './choice-option-store.js';
import {
  createNativeControlController,
  type NativeControlAdapter,
} from './native-control-controller.js';

import type { SelectFieldConfig, SelectOption } from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';

/**
 * Creates a native select that round-trips string and number values.
 *
 * @param config - Typed select configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createSelectFieldController<
  TFormValues extends object,
  TValue extends string | number,
>(
  config: SelectFieldConfig<TFormValues, TValue>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const selectElement = document.createElement('select');
  const optionStore = new ChoiceOptionStore(config.options);
  const clearOption = document.createElement('option');
  let committedToken = '';
  let isReadOnly = false;

  if (config.allowClear === true) {
    clearOption.value = '';
    clearOption.textContent = '';
    selectElement.append(clearOption);
  }

  const renderOptions = (): void => {
    selectElement.replaceChildren();
    if (config.allowClear === true) {
      selectElement.append(clearOption);
    }
    for (const [token, option] of optionStore.entries()) {
      const optionElement = document.createElement('option');
      optionElement.value = token;
      optionElement.textContent = option.label;
      optionElement.disabled = option.disabled ?? false;
      selectElement.append(optionElement);
    }
  };
  renderOptions();

  const preventReadOnlyPointerInteraction = (event: Event): void => {
    if (isReadOnly) {
      event.preventDefault();
    }
  };
  const preventReadOnlyKeyboardInteraction = (event: KeyboardEvent): void => {
    if (isReadOnly && event.key !== 'Tab') {
      event.preventDefault();
    }
  };
  const preserveReadOnlyValue = (event: Event): void => {
    if (isReadOnly) {
      selectElement.value = committedToken;
      event.stopImmediatePropagation();
    } else {
      committedToken = selectElement.value;
    }
  };

  selectElement.addEventListener('pointerdown', preventReadOnlyPointerInteraction);
  selectElement.addEventListener('keydown', preventReadOnlyKeyboardInteraction);
  selectElement.addEventListener('change', preserveReadOnlyValue);

  const adapter: NativeControlAdapter<TValue | undefined> = {
    control: selectElement,
    readValue: () => optionStore.valueForToken(selectElement.value),
    writeValue: (value: unknown) => {
      if (value === undefined) {
        selectElement.value = '';
        committedToken = selectElement.value;
        return;
      }

      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires a configured option value.`,
        );
      }

      const token = optionStore.tokenForValue(value as TValue);
      if (token === undefined) {
        throw new EditorConfigurationError(
          `Field "${config.name}" received an unknown option value.`,
        );
      }

      selectElement.value = token;
      committedToken = token;
    },
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      committedToken = selectElement.value;
      selectElement.setAttribute('aria-readonly', String(nextReadOnly));
    },
    validateNative: () =>
      selectElement.checkValidity() ? { valid: true } : { valid: false },
    destroy: () => {
      selectElement.removeEventListener('pointerdown', preventReadOnlyPointerInteraction);
      selectElement.removeEventListener('keydown', preventReadOnlyKeyboardInteraction);
      selectElement.removeEventListener('change', preserveReadOnlyValue);
    },
  };

  const controller = createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    onUserChange,
    requiredMessage,
  });

  return {
    ...controller,
    getOptions: () => optionStore.options(),
    setOptions: (options) => {
      const selectedValue = optionStore.valueForToken(selectElement.value);
      optionStore.replace(options as readonly SelectOption<TValue>[]);
      renderOptions();
      const retainedToken =
        selectedValue === undefined
          ? undefined
          : optionStore.tokenForValue(selectedValue);
      if (retainedToken === undefined) {
        if (config.allowClear === true) {
          selectElement.value = '';
        } else {
          selectElement.selectedIndex = -1;
        }
      } else {
        selectElement.value = retainedToken;
      }
      committedToken = selectElement.value;
    },
  };
}
