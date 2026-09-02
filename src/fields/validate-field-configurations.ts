import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { hasOwn } from '../core/has-own.js';
import { parseFieldPath } from '../object-path/field-path.js';

import { ChoiceOptionStore } from './choice-option-store.js';
import { assertAllowedFieldAttributes } from './field-attributes.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from './search-select-constants.js';
import { throwUnsupportedFieldType } from './unsupported-field-type.js';

import type { FieldConfig } from './field-config.js';

function hasConfiguredOption(
  options: readonly { readonly value: string | number }[],
  value: unknown,
): boolean {
  return options.some((option) => Object.is(option.value, value));
}

function assertSupportedFieldType<TFormValues extends object>(
  config: FieldConfig<TFormValues>,
): void {
  switch (config.type) {
    case 'checkbox':
    case 'custom':
    case 'date':
    case 'datetime-local':
    case 'email':
    case 'file':
    case 'hidden':
    case 'number':
    case 'password':
    case 'radio':
    case 'search-select':
    case 'select':
    case 'text':
    case 'textarea':
    case 'time':
      return;
    default:
      throwUnsupportedFieldType(config);
  }
}

function assertValidDefaultValue<TFormValues extends object>(
  config: FieldConfig<TFormValues>,
): void {
  if (!hasOwn(config, 'defaultValue')) {
    return;
  }

  const defaultValue: unknown = config.defaultValue;
  let isValid: boolean;
  switch (config.type) {
    case 'checkbox': {
      isValid = typeof defaultValue === 'boolean';
      break;
    }
    case 'number': {
      isValid =
        (typeof defaultValue === 'number' && Number.isFinite(defaultValue)) ||
        (config.emptyValue === null && defaultValue === null) ||
        (config.emptyValue !== null && defaultValue === undefined);
      break;
    }
    case 'radio':
    case 'select': {
      isValid =
        defaultValue === undefined || hasConfiguredOption(config.options, defaultValue);
      break;
    }
    case 'search-select': {
      isValid =
        defaultValue === undefined ||
        (config.remote !== undefined &&
          (typeof defaultValue === 'string' || typeof defaultValue === 'number')) ||
        hasConfiguredOption(config.options ?? [], defaultValue) ||
        (config.allowManualValue === true && typeof defaultValue === 'string');
      break;
    }
    case 'file': {
      isValid =
        config.multiple === true
          ? Array.isArray(defaultValue) && defaultValue.length === 0
          : defaultValue === null;
      break;
    }
    case 'custom': {
      isValid = true;
      break;
    }
    case 'date':
    case 'datetime-local':
    case 'email':
    case 'hidden':
    case 'password':
    case 'text':
    case 'textarea':
    case 'time': {
      isValid = typeof defaultValue === 'string';
      break;
    }
    default:
      throwUnsupportedFieldType(config);
  }

  if (!isValid) {
    throw new EditorConfigurationError(
      `defaultValue for field "${config.name}" is not valid for a ${config.type} field.`,
    );
  }
}

function assertPositiveLimit(
  limit: number | null | undefined,
  propertyName: string,
  fieldName: string,
): void {
  if (
    limit !== undefined &&
    limit !== null &&
    (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit))
  ) {
    throw new EditorConfigurationError(
      `${propertyName} for field "${fieldName}" must be a positive integer.`,
    );
  }
}

function assertNonNegativeInteger(
  value: number | undefined,
  propertyName: string,
  fieldName: string,
): void {
  if (
    value !== undefined &&
    (!Number.isFinite(value) || value < 0 || !Number.isInteger(value))
  ) {
    throw new EditorConfigurationError(
      `${propertyName} for field "${fieldName}" must be a non-negative integer.`,
    );
  }
}

/**
 * Validates runtime field invariants before an editor claims its table.
 *
 * @param fields - Consumer field configurations.
 * @throws EditorConfigurationError for malformed or ambiguous configuration.
 */
export function validateFieldConfigurations<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
): void {
  const configuredNames = new Set<string>();

  for (const config of fields) {
    assertSupportedFieldType(config);
    parseFieldPath(config.name);

    if (configuredNames.has(config.name)) {
      throw new EditorConfigurationError(
        `Field path "${config.name}" is configured more than once.`,
      );
    }
    configuredNames.add(config.name);
    const validateOn: unknown = config.validateOn;
    if (validateOn !== undefined && validateOn !== 'submit' && validateOn !== 'blur') {
      throw new EditorConfigurationError(
        `validateOn for field "${config.name}" must be "submit" or "blur".`,
      );
    }
    if (config.type === 'custom') {
      const definition: unknown = config.definition;
      if (typeof definition !== 'object' || definition === null) {
        throw new EditorConfigurationError(
          `Custom field "${config.name}" requires a definition.`,
        );
      }
      const definitionRecord = definition as Readonly<Record<string, unknown>>;
      if (typeof definitionRecord['createController'] !== 'function') {
        throw new EditorConfigurationError(
          `Custom field "${config.name}" requires a createController method.`,
        );
      }
      if (
        definitionRecord['isEqual'] !== undefined &&
        typeof definitionRecord['isEqual'] !== 'function'
      ) {
        throw new EditorConfigurationError(
          `Custom field "${config.name}" isEqual property must be a function.`,
        );
      }
      const capabilities = definitionRecord['capabilities'];
      if (
        capabilities !== undefined &&
        (typeof capabilities !== 'object' ||
          capabilities === null ||
          Array.isArray(capabilities) ||
          Object.entries(capabilities).some(
            ([name, value]) =>
              (name !== 'batch' && name !== 'inline') || typeof value !== 'boolean',
          ))
      ) {
        throw new EditorConfigurationError(
          `Custom field "${config.name}" capabilities are not valid.`,
        );
      }
      if (hasOwn(config, 'attributes')) {
        throw new EditorConfigurationError(
          `Custom field "${config.name}" attributes must be configured by its adapter.`,
        );
      }
    } else {
      assertAllowedFieldAttributes(config.attributes, config.type);
    }
    assertValidDefaultValue(config);

    if (config.type === 'hidden') {
      if (hasOwn(config, 'label')) {
        throw new EditorConfigurationError(
          `Hidden field "${config.name}" cannot define a label.`,
        );
      }
    } else if (typeof config.label !== 'string' || config.label.trim().length === 0) {
      throw new EditorConfigurationError(
        `Visible field "${config.name}" requires a label.`,
      );
    }

    if (
      (config.type === 'select' || config.type === 'radio') &&
      config.options.length === 0
    ) {
      throw new EditorConfigurationError(
        `Field "${config.name}" requires at least one option.`,
      );
    }

    if (config.type === 'select' || config.type === 'radio') {
      new ChoiceOptionStore<string | number>(config.options);
    }

    if (config.type === 'search-select') {
      const rawConfig = config as unknown as Readonly<Record<string, unknown>>;
      if (
        ['searchThreshold', 'debounceMs', 'loadOptions', 'resolveOption'].some(
          (propertyName) => hasOwn(rawConfig, propertyName),
        )
      ) {
        throw new EditorConfigurationError(
          `SearchSelect field "${config.name}" must configure search and remote options through their nested objects.`,
        );
      }
      const options = config.options ?? [];
      const remote: unknown = config.remote;
      const isRemote = remote !== undefined;
      if (
        isRemote &&
        (typeof remote !== 'object' ||
          remote === null ||
          typeof (remote as { readonly loadOptions?: unknown }).loadOptions !==
            'function' ||
          typeof (remote as { readonly resolveOption?: unknown }).resolveOption !==
            'function')
      ) {
        throw new EditorConfigurationError(
          `Remote SearchSelect field "${config.name}" requires loadOptions and resolveOption.`,
        );
      }
      const search: unknown = config.search;
      if (
        search !== undefined &&
        (typeof search !== 'object' || search === null || Array.isArray(search))
      ) {
        throw new EditorConfigurationError(
          `search for field "${config.name}" must be an object.`,
        );
      }
      const searchOptions = search as
        | {
            readonly debounceMs?: unknown;
            readonly enabled?: unknown;
            readonly threshold?: unknown;
          }
        | undefined;
      if (
        searchOptions?.enabled !== undefined &&
        typeof searchOptions.enabled !== 'boolean'
      ) {
        throw new EditorConfigurationError(
          `search.enabled for field "${config.name}" must be a boolean.`,
        );
      }
      if (isRemote && searchOptions?.enabled === false) {
        throw new EditorConfigurationError(
          `Remote SearchSelect field "${config.name}" requires search to be enabled.`,
        );
      }
      if (!isRemote && options.length === 0) {
        throw new EditorConfigurationError(
          `Field "${config.name}" requires at least one option.`,
        );
      }
      if (options.length > SEARCH_SELECT_MAX_OPTION_COUNT) {
        throw new EditorConfigurationError(
          `Field "${config.name}" exceeds the ${String(SEARCH_SELECT_MAX_OPTION_COUNT)}-option SearchSelect limit.`,
        );
      }
      new ChoiceOptionStore<string | number>(options);
      assertNonNegativeInteger(
        searchOptions?.threshold as number | undefined,
        'search.threshold',
        config.name,
      );
      assertNonNegativeInteger(
        searchOptions?.debounceMs as number | undefined,
        'search.debounceMs',
        config.name,
      );
      if (
        config.allowManualValue === true &&
        options.some(({ value }) => typeof value !== 'string')
      ) {
        throw new EditorConfigurationError(
          `Field "${config.name}" can allow manual values only with string options.`,
        );
      }
    }

    if (config.type === 'file') {
      assertPositiveLimit(config.maxFileBytes, 'maxFileBytes', config.name);
      if (config.multiple === true) {
        assertPositiveLimit(config.maxFileCount, 'maxFileCount', config.name);
      }
    }

    if (
      config.type === 'textarea' &&
      config.rows !== undefined &&
      (!Number.isInteger(config.rows) || config.rows <= 0)
    ) {
      throw new EditorConfigurationError(
        `rows for field "${config.name}" must be a positive integer.`,
      );
    }
  }
}
