import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { hasOwn } from '../core/has-own.js';
import { isPlainCallbackResult } from '../core/is-plain-callback-result.js';
import { ChoiceOptionStore } from '../fields/choice-option-store.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from '../fields/search-select-constants.js';
import { parseFieldPath } from '../object-path/field-path.js';

import type { FieldConfig, SelectOption } from '../contracts/field-config.js';
import type { MaybePromise } from '../contracts/field-value.js';
import type { FormDependencyResult } from '../contracts/form-dependency.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldRuntimeController } from './field-runtime-controller.js';

const PATCH_PROPERTIES = new Set([
  'disabled',
  'options',
  'readOnly',
  'required',
  'value',
  'visible',
]);

/** Configured resources required to validate and apply one field patch. */
export interface DependencyFieldBinding<TFormValues extends object> {
  readonly config: Readonly<FieldConfig<TFormValues>>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly runtime: FieldRuntimeController<TFormValues>;
}

/** Information exposed after one validated dependency patch is applied. */
export interface DependencyPatchApplication<TFormValues extends object> {
  readonly isCurrent: () => boolean;
  readonly binding: DependencyFieldBinding<TFormValues>;
  readonly targetPath: string;
  readonly hasOptions: boolean;
  readonly hasValue: boolean;
}

export interface DependencyPatchCallbacks<TFormValues extends object> {
  readonly applyValue?: (
    targetPath: string,
    binding: DependencyFieldBinding<TFormValues>,
    value: unknown,
  ) => MaybePromise<void>;
  readonly afterApplyPatch?: (
    application: Readonly<DependencyPatchApplication<TFormValues>>,
  ) => MaybePromise<void>;
}

export interface ValidatedFieldPatch<TFormValues extends object> {
  readonly binding: DependencyFieldBinding<TFormValues>;
  readonly targetPath: string;
  readonly hasDisabled: boolean;
  readonly disabled?: boolean;
  readonly hasOptions: boolean;
  readonly options?: readonly SelectOption[];
  readonly hasReadOnly: boolean;
  readonly readOnly?: boolean;
  readonly hasRequired: boolean;
  readonly required?: boolean;
  readonly hasValue: boolean;
  readonly value?: unknown;
  readonly hasVisible: boolean;
  readonly visible?: boolean;
}

function hasOptionValue(options: readonly SelectOption[], value: unknown): boolean {
  return options.some((option) => Object.is(option.value, value));
}

function assertCompatibleValue<TFormValues extends object>(
  config: Readonly<FieldConfig<TFormValues>>,
  value: unknown,
  options: readonly SelectOption[],
): void {
  let isValid = false;
  switch (config.type) {
    case 'checkbox': {
      isValid = typeof value === 'boolean';
      break;
    }
    case 'custom': {
      isValid = true;
      break;
    }
    case 'number': {
      isValid =
        (typeof value === 'number' && Number.isFinite(value)) ||
        (config.emptyValue === null ? value === null : value === undefined);
      break;
    }
    case 'radio':
    case 'select': {
      isValid = value === undefined || hasOptionValue(options, value);
      break;
    }
    case 'search-select': {
      isValid =
        value === undefined ||
        (config.remote !== undefined &&
          (typeof value === 'string' || typeof value === 'number')) ||
        hasOptionValue(options, value) ||
        (config.allowManualValue === true && typeof value === 'string');
      break;
    }
    case 'file': {
      isValid =
        config.multiple === true
          ? Array.isArray(value) && value.length === 0
          : value === null;
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
      isValid = typeof value === 'string';
      break;
    }
  }

  if (!isValid) {
    throw new EditorConfigurationError(
      `Dependency value for field "${config.name}" is not valid for a ${config.type} field.`,
    );
  }
}

export function validateDependencyPatches<TFormValues extends object>(
  result: FormDependencyResult<TFormValues>,
  fields: ReadonlyMap<string, DependencyFieldBinding<TFormValues>>,
): readonly ValidatedFieldPatch<TFormValues>[] {
  if (!isPlainCallbackResult(result)) {
    throw new EditorConfigurationError(
      'A dependency resolver must return a field patch object.',
    );
  }

  const validatedPatches: ValidatedFieldPatch<TFormValues>[] = [];
  for (const [targetPath, rawPatch] of Object.entries(result)) {
    parseFieldPath(targetPath);
    const binding = fields.get(targetPath);
    if (binding === undefined) {
      throw new EditorConfigurationError(
        `Dependency target field "${targetPath}" is unavailable.`,
      );
    }
    if (!isPlainCallbackResult(rawPatch)) {
      throw new EditorConfigurationError(
        `Dependency patch for field "${targetPath}" must be an object.`,
      );
    }
    for (const propertyName of Object.keys(rawPatch)) {
      if (!PATCH_PROPERTIES.has(propertyName)) {
        throw new EditorConfigurationError(
          `Dependency patch for field "${targetPath}" contains unsupported property "${propertyName}".`,
        );
      }
    }

    const hasVisible = hasOwn(rawPatch, 'visible');
    const hasDisabled = hasOwn(rawPatch, 'disabled');
    const hasReadOnly = hasOwn(rawPatch, 'readOnly');
    const hasRequired = hasOwn(rawPatch, 'required');
    for (const propertyName of ['visible', 'disabled', 'readOnly', 'required'] as const) {
      if (hasOwn(rawPatch, propertyName) && typeof rawPatch[propertyName] !== 'boolean') {
        throw new EditorConfigurationError(
          `Dependency property "${propertyName}" for field "${targetPath}" must be a boolean.`,
        );
      }
    }
    if (binding.config.type === 'hidden' && hasVisible && rawPatch['visible'] === true) {
      throw new EditorConfigurationError(
        `Hidden field "${targetPath}" cannot be made visible.`,
      );
    }

    const hasOptions = hasOwn(rawPatch, 'options');
    let options: readonly SelectOption[] | undefined;
    if (hasOptions) {
      if (
        binding.controller.getOptions === undefined ||
        binding.controller.setOptions === undefined
      ) {
        throw new EditorConfigurationError(
          `Dependency options require a choice field target; "${targetPath}" is not a choice field.`,
        );
      }
      const rawOptions = rawPatch['options'];
      if (!Array.isArray(rawOptions)) {
        throw new EditorConfigurationError(
          `Dependency options for field "${targetPath}" must be an array.`,
        );
      }
      options = new ChoiceOptionStore(rawOptions as readonly SelectOption[]).options();
      if (
        binding.config.type === 'search-select' &&
        options.length > SEARCH_SELECT_MAX_OPTION_COUNT
      ) {
        throw new EditorConfigurationError(
          `Field "${targetPath}" exceeds the ${String(SEARCH_SELECT_MAX_OPTION_COUNT)}-option SearchSelect limit.`,
        );
      }
      if (
        binding.config.type === 'search-select' &&
        binding.config.allowManualValue === true &&
        options.some(({ value }) => typeof value !== 'string')
      ) {
        throw new EditorConfigurationError(
          `Field "${targetPath}" can allow manual values only with string options.`,
        );
      }
    }

    const hasValue = hasOwn(rawPatch, 'value');
    const candidateOptions = options ?? binding.controller.getOptions?.() ?? [];
    if (hasValue) {
      assertCompatibleValue(binding.config, rawPatch['value'], candidateOptions);
    }

    validatedPatches.push({
      binding,
      targetPath,
      hasDisabled,
      ...(hasDisabled ? { disabled: rawPatch['disabled'] as boolean } : {}),
      hasOptions,
      ...(options === undefined ? {} : { options }),
      hasReadOnly,
      ...(hasReadOnly ? { readOnly: rawPatch['readOnly'] as boolean } : {}),
      hasRequired,
      ...(hasRequired ? { required: rawPatch['required'] as boolean } : {}),
      hasValue,
      ...(hasValue ? { value: rawPatch['value'] } : {}),
      hasVisible,
      ...(hasVisible ? { visible: rawPatch['visible'] as boolean } : {}),
    });
  }
  return validatedPatches;
}

export async function applyDependencyPatches<TFormValues extends object>(
  callbacks: Readonly<DependencyPatchCallbacks<TFormValues>>,
  patches: readonly ValidatedFieldPatch<TFormValues>[],
  isCurrent: () => boolean,
): Promise<void> {
  for (const patch of patches) {
    if (!isCurrent()) {
      return;
    }
    const { controller, runtime } = patch.binding;
    if (patch.hasOptions) {
      controller.setOptions?.(patch.options ?? []);
    }
    if (patch.hasValue) {
      if (callbacks.applyValue === undefined) {
        controller.setValue(patch.value);
      } else {
        await callbacks.applyValue(patch.targetPath, patch.binding, patch.value);
        if (!isCurrent()) {
          return;
        }
      }
    }
    if (patch.hasVisible) {
      runtime.setVisible(patch.visible ?? false);
    }
    if (patch.hasReadOnly) {
      runtime.setReadOnly(patch.readOnly ?? false);
    }
    if (patch.hasRequired) {
      runtime.setRequired(patch.required ?? false);
    }
    if (patch.hasDisabled) {
      runtime.setDisabled(patch.disabled ?? false);
    }
    await callbacks.afterApplyPatch?.({
      isCurrent,
      binding: patch.binding,
      hasOptions: patch.hasOptions,
      hasValue: patch.hasValue,
      targetPath: patch.targetPath,
    });
  }
}
