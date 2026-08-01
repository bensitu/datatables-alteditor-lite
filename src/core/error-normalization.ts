import { AltEditorLiteError } from './alt-editor-lite-error.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';

interface OperationErrorLike {
  readonly message: string;
  readonly code?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
  readonly retryable?: boolean;
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
    if (value instanceof Error || !Object.hasOwn(value, 'message')) {
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
    return new AltEditorLiteError({
      message: rawError.message,
      ...(rawError.code === undefined ? {} : { code: rawError.code }),
      ...(rawError.fieldErrors === undefined
        ? {}
        : { fieldErrors: rawError.fieldErrors }),
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
