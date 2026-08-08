import { SearchSelect } from '../search-select/search-select.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';

import type {
  SearchSelectFieldConfig,
  SelectOption,
  VisibleFieldConfig,
} from './field-config.js';
import type { ManagedFieldController } from './managed-field-controller.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

type ControllerConfig<TFormValues extends object> =
  | SearchSelectFieldConfig<TFormValues>
  | SearchSelectFieldConfig<TFormValues, number>
  | SearchSelectFieldConfig<TFormValues, string | number>;

/**
 * Creates a typed local SearchSelect field controller.
 *
 * @param config - Validated SearchSelect configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param language - Complete resolved language.
 * @param onUserChange - Form-owned committed-value notification.
 * @returns Managed field controller with dynamic option support.
 */
export function createSearchSelectFieldController<TFormValues extends object>(
  config: ControllerConfig<TFormValues>,
  fieldId: string,
  language: Readonly<AltEditorLiteLanguage>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  const searchSelect = new SearchSelect<string | number>({
    allowClear: config.allowClear ?? false,
    allowManualValue: config.allowManualValue ?? false,
    debounceMs: config.debounceMs ?? 0,
    fieldId,
    locale: language.locale,
    messages: {
      clear: language.searchSelect.clear,
      instructions: language.accessibility.searchSelectInstructions,
      noResults: language.searchSelect.noResults,
      placeholder: language.searchSelect.placeholder,
      results: language.accessibility.searchSelectResults,
      searchPlaceholder: language.searchSelect.searchPlaceholder,
      selection: language.accessibility.searchSelectSelection,
    },
    onCommit: onUserChange,
    options: config.options,
    searchThreshold: config.searchThreshold ?? 0,
    sortOptions: config.sortOptions ?? false,
  });

  const adapter: NativeControlAdapter<string | number | undefined> = {
    control: searchSelect.inputElement,
    readValue: () => searchSelect.getValue(),
    writeValue: (value: unknown) => {
      searchSelect.setValue(value);
    },
    setReadOnly: (isReadOnly: boolean) => {
      searchSelect.setReadOnly(isReadOnly);
    },
    validateNative: () =>
      config.required === true && searchSelect.getValue() === undefined
        ? { valid: false, message: language.validation.required }
        : { valid: true },
    destroy: () => {
      searchSelect.destroy();
    },
  };
  // Field configurations are validated before the controller is constructed.
  const foundationConfig = config as unknown as VisibleFieldConfig<
    TFormValues,
    string | number | undefined
  >;
  const nativeController = createNativeControlController<
    TFormValues,
    string | number | undefined
  >({
    adapter,
    config: foundationConfig,
    controlContainer: searchSelect.element,
    fieldId,
    invalidMessage: language.validation.invalid,
    onUserChange: () => undefined,
    requiredMessage: language.validation.required,
  });
  const describedBy = searchSelect.inputElement.getAttribute('aria-describedby');
  const descriptionIds = new Set(describedBy?.split(/\s+/u) ?? []);
  descriptionIds.add(searchSelect.instructionsId);
  searchSelect.inputElement.setAttribute(
    'aria-describedby',
    [...descriptionIds].filter((id) => id.length > 0).join(' '),
  );

  searchSelect.setDisabled(config.disabled ?? false);

  return {
    ...nativeController,
    setDisabled: (isDisabled: boolean) => {
      nativeController.setDisabled(isDisabled);
      searchSelect.setDisabled(isDisabled);
    },
    setOptions: (options: readonly SelectOption[]) => {
      searchSelect.setOptions(options);
    },
  };
}
