import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import {
  createNativeControlController,
  type NativeControlAdapter,
} from './field-controller-foundation.js';
import {
  DEFAULT_DATA_URL_MAX_FILE_BYTES,
  DEFAULT_DATA_URL_MAX_FILE_COUNT,
  type FileBudget,
  type FileBudgetMessages,
  validateFileBudget,
} from './file-budget.js';
import { readFileAsDataUrl, readFilesAsDataUrls } from './read-file-data-url.js';

import type {
  FileFieldConfig,
  MultipleFileFieldConfig,
  SingleFileFieldConfig,
  VisibleFieldConfig,
} from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { ManagedFieldController } from './managed-field-controller.js';

interface FileProperties {
  readonly accept?: string;
  readonly encoding?: 'data-url' | 'file';
  readonly maxFileBytes?: number | null;
  readonly maxFileCount?: number | null;
  readonly multiple?: boolean;
}

function resolveFileBudget(config: Readonly<FileProperties>): FileBudget {
  const defaultMaxFileBytes =
    config.encoding === 'data-url' ? DEFAULT_DATA_URL_MAX_FILE_BYTES : undefined;
  const defaultMaxFileCount =
    config.encoding === 'data-url' && config.multiple === true
      ? DEFAULT_DATA_URL_MAX_FILE_COUNT
      : undefined;
  const maxFileBytes =
    config.maxFileBytes === null
      ? undefined
      : (config.maxFileBytes ?? defaultMaxFileBytes);
  const maxFileCount =
    config.maxFileCount === null
      ? undefined
      : (config.maxFileCount ?? defaultMaxFileCount);

  return {
    ...(maxFileBytes === undefined ? {} : { maxFileBytes }),
    ...(maxFileCount === undefined ? {} : { maxFileCount }),
  };
}

function selectedFiles(inputElement: HTMLInputElement): readonly File[] {
  return inputElement.files === null ? [] : [...inputElement.files];
}

function isEmptyFileValue(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.length === 0);
}

function createTypedFileController<TFormValues extends object, TValue>(
  config: VisibleFieldConfig<TFormValues, TValue> & FileProperties,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
  readValue: (
    files: readonly File[],
    signal: AbortSignal,
  ) => TValue | PromiseLike<TValue>,
): ManagedFieldController<TFormValues> {
  const inputElement = document.createElement('input');
  const lifecycleAbortController = new AbortController();
  const fileBudget = resolveFileBudget(config);
  let isReadOnly = false;

  inputElement.type = 'file';
  inputElement.multiple = config.multiple === true;

  if (config.accept !== undefined) {
    inputElement.accept = config.accept;
  }

  const preventReadOnlyInteraction = (event: Event): void => {
    if (isReadOnly) {
      event.preventDefault();
    }
  };
  inputElement.addEventListener('click', preventReadOnlyInteraction);
  inputElement.addEventListener('keydown', preventReadOnlyInteraction);

  const validateSelection = (): FieldValidationResult => {
    if (!inputElement.checkValidity()) {
      return { valid: false };
    }

    try {
      validateFileBudget(selectedFiles(inputElement), fileBudget, budgetMessages);
      return { valid: true };
    } catch (error: unknown) {
      return {
        valid: false,
        message: error instanceof Error ? error.message : invalidMessage,
      };
    }
  };

  const adapter: NativeControlAdapter<TValue> = {
    control: inputElement,
    readValue: (signal?: AbortSignal) => {
      const selection = selectedFiles(inputElement);
      validateFileBudget(selection, fileBudget, budgetMessages);
      const readSignal =
        signal === undefined
          ? lifecycleAbortController.signal
          : AbortSignal.any([lifecycleAbortController.signal, signal]);
      return readValue(selection, readSignal);
    },
    writeValue: (value: unknown) => {
      if (!isEmptyFileValue(value)) {
        throw new EditorConfigurationError(
          `Field "${config.name}" cannot be populated with a non-empty file value.`,
        );
      }

      inputElement.value = '';
    },
    setReadOnly: (nextReadOnly: boolean) => {
      isReadOnly = nextReadOnly;
      inputElement.setAttribute('aria-readonly', String(nextReadOnly));
    },
    validateNative: validateSelection,
    destroy: () => {
      lifecycleAbortController.abort();
      inputElement.removeEventListener('click', preventReadOnlyInteraction);
      inputElement.removeEventListener('keydown', preventReadOnlyInteraction);
    },
  };

  return createNativeControlController({
    adapter,
    config,
    fieldId,
    invalidMessage,
    onUserChange,
    requiredMessage,
  });
}

function createSingleFileController<TFormValues extends object>(
  config: Extract<SingleFileFieldConfig<TFormValues>, { readonly encoding?: 'file' }>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  return createTypedFileController(
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    budgetMessages,
    onUserChange,
    (files) => files[0] ?? null,
  );
}

function createSingleDataUrlController<TFormValues extends object>(
  config: Extract<SingleFileFieldConfig<TFormValues>, { readonly encoding: 'data-url' }>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  return createTypedFileController(
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    budgetMessages,
    onUserChange,
    async (files, signal) => {
      const file = files[0];
      return file === undefined ? null : await readFileAsDataUrl(file, signal);
    },
  );
}

function createMultipleFileController<TFormValues extends object>(
  config: Extract<MultipleFileFieldConfig<TFormValues>, { readonly encoding?: 'file' }>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  return createTypedFileController(
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    budgetMessages,
    onUserChange,
    (files) => files,
  );
}

function createMultipleDataUrlController<TFormValues extends object>(
  config: Extract<
    MultipleFileFieldConfig<TFormValues>,
    { readonly encoding: 'data-url' }
  >,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  return createTypedFileController(
    config,
    fieldId,
    invalidMessage,
    requiredMessage,
    budgetMessages,
    onUserChange,
    async (files, signal) => await readFilesAsDataUrls(files, signal),
  );
}

/**
 * Creates a single or multiple file controller with exact encoding behavior.
 *
 * @param config - File field configuration.
 * @param fieldId - Instance-scoped control identifier.
 * @param invalidMessage - Validation fallback.
 * @param budgetMessages - File budget messages.
 * @param onUserChange - Form-owned change notification.
 * @returns Managed field controller.
 */
export function createFileFieldController<TFormValues extends object>(
  config: FileFieldConfig<TFormValues>,
  fieldId: string,
  invalidMessage: string,
  requiredMessage: string,
  budgetMessages: Readonly<FileBudgetMessages>,
  onUserChange: () => void,
): ManagedFieldController<TFormValues> {
  if (config.multiple === true) {
    return config.encoding === 'data-url'
      ? createMultipleDataUrlController(
          config,
          fieldId,
          invalidMessage,
          requiredMessage,
          budgetMessages,
          onUserChange,
        )
      : createMultipleFileController(
          config,
          fieldId,
          invalidMessage,
          requiredMessage,
          budgetMessages,
          onUserChange,
        );
  }

  return config.encoding === 'data-url'
    ? createSingleDataUrlController(
        config,
        fieldId,
        invalidMessage,
        requiredMessage,
        budgetMessages,
        onUserChange,
      )
    : createSingleFileController(
        config,
        fieldId,
        invalidMessage,
        requiredMessage,
        budgetMessages,
        onUserChange,
      );
}
