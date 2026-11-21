import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';

/** Renders unique form messages and active dependency errors in display order. */
export function renderFormFeedback(
  element: HTMLElement,
  submissionMessages: Iterable<string | undefined>,
  dependencyErrors: ReadonlyMap<string, AltEditorLiteError> | undefined,
): void {
  const messages = new Set<string>();
  for (const message of submissionMessages) {
    if (message !== undefined) {
      messages.add(message);
    }
  }
  for (const error of dependencyErrors?.values() ?? []) {
    messages.add(error.message);
  }
  element.textContent = [...messages].join(' ');
  element.hidden = messages.size === 0;
}

/** Converts dependency failures to field messages for form validation. */
export function dependencyFieldErrors(
  errors: ReadonlyMap<string, AltEditorLiteError> | undefined,
): Record<string, string> | undefined {
  if (errors === undefined || errors.size === 0) {
    return undefined;
  }
  return Object.fromEntries(
    [...errors].map(([fieldName, error]) => [fieldName, error.message]),
  );
}
