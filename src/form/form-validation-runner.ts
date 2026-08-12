import {
  AltEditorLiteError,
  EditorConfigurationError,
} from '../core/alt-editor-lite-error.js';
import { freezeEditorValues } from '../core/freeze-editor-values.js';
import { parseFieldPath } from '../object-path/field-path.js';

import type { FormValidationResult } from './form-validation.js';
import type { EditorValues } from '../core/editor-values.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** Internal callback for table-scoped local uniqueness checks. */
export type LocalUniqueValidator<TFormValues extends object> = (
  values: Readonly<EditorValues<TFormValues>>,
) => Readonly<Record<string, string>>;

/** Form-level callback with its public operation context already bound. */
export type BoundFormValidator<TFormValues extends object> = (
  values: Readonly<EditorValues<TFormValues>>,
  signal: AbortSignal,
) => FormValidationResult<TFormValues> | PromiseLike<FormValidationResult<TFormValues>>;

export type ValidationExecutionResult<TFormValues extends object> =
  | {
      readonly valid: true;
      readonly values: Readonly<EditorValues<TFormValues>>;
    }
  | {
      readonly valid: false;
      readonly error: AltEditorLiteError;
      readonly message?: string;
    };

export interface FormValidationRunnerArguments<TFormValues extends object> {
  readonly allowedFieldNames: ReadonlySet<string>;
  readonly controllers: readonly ManagedFieldController<TFormValues>[];
  readonly collectValues: (
    signal: AbortSignal,
  ) =>
    | Readonly<EditorValues<TFormValues>>
    | PromiseLike<Readonly<EditorValues<TFormValues>>>;
  readonly invalidMessage: string;
  readonly validateUnique?: LocalUniqueValidator<TFormValues>;
  readonly validateForm?: BoundFormValidator<TFormValues>;
  readonly beforeFormValidation?: (
    signal: AbortSignal,
  ) => AltEditorLiteError | undefined | PromiseLike<AltEditorLiteError | undefined>;
}

function isObjectRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function settleOnAbort<TValue>(
  value: TValue | PromiseLike<TValue>,
  signal: AbortSignal,
): Promise<TValue> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('The request was aborted.', 'AbortError'));
  }

  return new Promise<TValue>((resolve, reject) => {
    const handleAbort = (): void => {
      reject(new DOMException('The request was aborted.', 'AbortError'));
    };
    signal.addEventListener('abort', handleAbort, { once: true });
    void Promise.resolve(value).then(
      (result) => {
        signal.removeEventListener('abort', handleAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort);
        reject(
          error instanceof Error
            ? error
            : new Error('Validation failed.', { cause: error }),
        );
      },
    );
  });
}

function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    ((typeof value === 'object' && value !== null) || typeof value === 'function') &&
    'then' in value
  );
}

function mergeFirstErrors(
  target: Record<string, string>,
  source: Readonly<Record<string, string | undefined>>,
): void {
  for (const [fieldName, message] of Object.entries(source)) {
    if (message !== undefined && !Object.hasOwn(target, fieldName)) {
      target[fieldName] = message;
    }
  }
}

/** Runs native, field, uniqueness, and form-level validation in stable order. */
export class FormValidationRunner<TFormValues extends object> {
  public constructor(
    private readonly arguments_: FormValidationRunnerArguments<TFormValues>,
  ) {}

  public async run(signal: AbortSignal): Promise<ValidationExecutionResult<TFormValues>> {
    signal.throwIfAborted();
    const nativeErrors = this.validateNative();
    if (Object.keys(nativeErrors).length > 0) {
      return this.failure(nativeErrors);
    }

    const collectedValues = this.arguments_.collectValues(signal);
    const values = freezeEditorValues<TFormValues>(
      isPromiseLike<Readonly<EditorValues<TFormValues>>>(collectedValues)
        ? await settleOnAbort(collectedValues, signal)
        : collectedValues,
    );
    signal.throwIfAborted();

    const fieldErrors = await this.validateFields(values, signal);
    if (this.arguments_.validateUnique !== undefined) {
      mergeFirstErrors(fieldErrors, this.arguments_.validateUnique(values));
    }

    if (this.arguments_.beforeFormValidation !== undefined) {
      const precedingError = await settleOnAbort(
        this.arguments_.beforeFormValidation(signal),
        signal,
      );
      signal.throwIfAborted();
      if (precedingError !== undefined) {
        return { error: precedingError, valid: false };
      }
    }

    let isFormInvalid = false;
    let message: string | undefined;
    if (this.arguments_.validateForm !== undefined) {
      const result = await settleOnAbort(
        this.arguments_.validateForm(values, signal),
        signal,
      );
      signal.throwIfAborted();
      const validatedResult = this.validateFormResult(result);
      if (!validatedResult.valid) {
        isFormInvalid = true;
        message = validatedResult.message;
        mergeFirstErrors(fieldErrors, validatedResult.fieldErrors ?? {});
      }
    }

    if (isFormInvalid || Object.keys(fieldErrors).length > 0) {
      return this.failure(fieldErrors, message);
    }
    return { valid: true, values };
  }

  private validateNative(): Record<string, string> {
    const fieldErrors: Record<string, string> = {};
    for (const controller of this.arguments_.controllers) {
      if (controller.isDisabled()) {
        continue;
      }
      const result = controller.validateNative();
      if (!result.valid) {
        fieldErrors[controller.name] = result.message ?? this.arguments_.invalidMessage;
      }
    }
    return fieldErrors;
  }

  private async validateFields(
    values: Readonly<EditorValues<TFormValues>>,
    signal: AbortSignal,
  ): Promise<Record<string, string>> {
    const results = await settleOnAbort(
      Promise.all(
        this.arguments_.controllers
          .filter((controller) => !controller.isDisabled())
          .map(async (controller) => {
            try {
              return {
                name: controller.name,
                result: await controller.validateCustom(values, signal),
              };
            } catch {
              signal.throwIfAborted();
              return {
                name: controller.name,
                result: {
                  message: this.arguments_.invalidMessage,
                  valid: false,
                } as const,
              };
            }
          }),
      ),
      signal,
    );

    const fieldErrors: Record<string, string> = {};
    for (const { name, result } of results) {
      if (!result.valid) {
        fieldErrors[name] = result.message ?? this.arguments_.invalidMessage;
      }
    }
    return fieldErrors;
  }

  private validateFormResult(value: unknown): FormValidationResult<TFormValues> {
    if (!isObjectRecord(value) || typeof value['valid'] !== 'boolean') {
      throw new EditorConfigurationError(
        'validateForm must return an object with a boolean valid property.',
      );
    }
    if (value['valid']) {
      return { valid: true };
    }

    const rawMessage = value['message'];
    if (rawMessage !== undefined && typeof rawMessage !== 'string') {
      throw new EditorConfigurationError(
        'validateForm message must be a string when provided.',
      );
    }

    const rawFieldErrors = value['fieldErrors'];
    if (rawFieldErrors === undefined) {
      return {
        valid: false,
        ...(rawMessage === undefined ? {} : { message: rawMessage }),
      };
    }
    if (!isObjectRecord(rawFieldErrors)) {
      throw new EditorConfigurationError(
        'validateForm fieldErrors must be an object when provided.',
      );
    }

    const fieldErrors: Record<string, string> = {};
    for (const [fieldName, fieldMessage] of Object.entries(rawFieldErrors)) {
      parseFieldPath(fieldName);
      if (!this.arguments_.allowedFieldNames.has(fieldName)) {
        throw new EditorConfigurationError(
          `validateForm returned an error for unknown field "${fieldName}".`,
        );
      }
      if (typeof fieldMessage !== 'string') {
        throw new EditorConfigurationError(
          `validateForm error for field "${fieldName}" must be a string.`,
        );
      }
      fieldErrors[fieldName] = fieldMessage;
    }

    return {
      fieldErrors,
      valid: false,
      ...(rawMessage === undefined ? {} : { message: rawMessage }),
    } as FormValidationResult<TFormValues>;
  }

  private failure(
    fieldErrors: Readonly<Record<string, string>>,
    message?: string,
  ): Extract<ValidationExecutionResult<TFormValues>, { readonly valid: false }> {
    const displayMessage =
      message ??
      (Object.keys(fieldErrors).length === 0
        ? this.arguments_.invalidMessage
        : undefined);
    const errorMessage =
      message ?? Object.values(fieldErrors)[0] ?? this.arguments_.invalidMessage;
    return {
      error: new AltEditorLiteError({
        code: 'VALIDATION',
        ...(Object.keys(fieldErrors).length === 0 ? {} : { fieldErrors }),
        message: errorMessage,
        retryable: true,
      }),
      ...(displayMessage === undefined ? {} : { message: displayMessage }),
      valid: false,
    };
  }
}
