import { AltEditorLiteError } from './alt-editor-lite-error.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';

interface OperationErrorLike {
  readonly message: string;
  readonly code?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly retryable?: boolean;
}

const MAX_OPERATION_ERROR_MESSAGE_LENGTH = 2000;
const MAX_FIELD_ERROR_MESSAGE_LENGTH = 1000;

function truncateUiMessage(message: string, maximumLength: number): string {
  return message.length <= maximumLength
    ? message
    : `${message.slice(0, maximumLength - 1)}…`;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function hasValidOptionalString(
  errorRecord: Readonly<Record<string, unknown>>,
  propertyName: 'code',
): boolean {
  return (
    !Object.hasOwn(errorRecord, propertyName) ||
    typeof errorRecord[propertyName] === 'string'
  );
}

function hasValidOptionalBoolean(
  errorRecord: Readonly<Record<string, unknown>>,
  propertyName: 'retryable',
): boolean {
  return (
    !Object.hasOwn(errorRecord, propertyName) ||
    typeof errorRecord[propertyName] === 'boolean'
  );
}

function isFieldErrorRecord(value: unknown): value is Readonly<Record<string, string>> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((message) => typeof message === 'string');
}

function isOperationErrorLike(value: unknown): value is OperationErrorLike {
  if (!isRecord(value)) {
    return false;
  }

  try {
    if (!Object.hasOwn(value, 'message')) {
      return false;
    }

    if (
      value instanceof Error &&
      !Object.hasOwn(value, 'code') &&
      !Object.hasOwn(value, 'fieldErrors') &&
      !Object.hasOwn(value, 'retryable')
    ) {
      return false;
    }

    return (
      typeof value['message'] === 'string' &&
      hasValidOptionalString(value, 'code') &&
      hasValidOptionalBoolean(value, 'retryable') &&
      (!Object.hasOwn(value, 'fieldErrors') || isFieldErrorRecord(value['fieldErrors']))
    );
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  try {
    return error instanceof Error && error.name === 'AbortError';
  } catch {
    return false;
  }
}

function isAltEditorLiteError(error: unknown): error is AltEditorLiteError {
  try {
    return error instanceof AltEditorLiteError;
  } catch {
    return false;
  }
}

/**
 * Internal cancellation marker that must never be displayed or published.
 */
export class InternalOperationAbort {
  /** Stable internal discriminator. */
  public readonly type = 'operation-abort';
}

/**
 * Normalizes callback failures without exposing arbitrary values to the UI.
 *
 * @param rawError - Value thrown or rejected by consumer code.
 * @param signal - Signal owned by the current operation.
 * @param language - Resolved safe fallback text.
 * @returns A public safe error or an internal cancellation marker.
 */
export function normalizeOperationError(
  rawError: unknown,
  signal: AbortSignal,
  language: Readonly<AltEditorLiteLanguage>,
): AltEditorLiteError | InternalOperationAbort {
  if (isAltEditorLiteError(rawError)) {
    return rawError;
  }

  if (signal.aborted || isAbortError(rawError)) {
    return new InternalOperationAbort();
  }

  if (isOperationErrorLike(rawError)) {
    const fieldErrors =
      rawError.fieldErrors === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(rawError.fieldErrors).map(([fieldName, message]) => [
              fieldName,
              truncateUiMessage(message, MAX_FIELD_ERROR_MESSAGE_LENGTH),
            ]),
          );
    return new AltEditorLiteError({
      message: truncateUiMessage(rawError.message, MAX_OPERATION_ERROR_MESSAGE_LENGTH),
      ...(rawError.code === undefined ? {} : { code: rawError.code }),
      ...(fieldErrors === undefined ? {} : { fieldErrors }),
      ...(rawError.retryable === undefined ? {} : { retryable: rawError.retryable }),
      cause: rawError,
    });
  }

  return new AltEditorLiteError({
    cause: rawError,
    code: 'UNKNOWN',
    message: language.errors.generic,
    retryable: false,
  });
}
