import { EditorConfigurationError } from './alt-editor-lite-error.js';

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function assertCompleteRow(
  rowCandidate: unknown,
  callbackName: string,
): asserts rowCandidate is object {
  if (
    typeof rowCandidate !== 'object' ||
    rowCandidate === null ||
    Array.isArray(rowCandidate)
  ) {
    throw new EditorConfigurationError(
      `${callbackName} must return a complete row object.`,
    );
  }
}
