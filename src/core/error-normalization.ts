import { AltEditorLiteError } from './alt-editor-lite-error.js';

import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';

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
export class InternalOperationAbort extends Error {
  /** Stable internal discriminator. */
  public readonly type = 'operation-abort';

  public constructor() {
    super('The owned operation was aborted.');
    this.name = 'InternalOperationAbort';
  }
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

  return new AltEditorLiteError({
    cause: rawError,
    code: 'UNKNOWN',
    message: language.errors.generic,
    retryable: false,
  });
}
