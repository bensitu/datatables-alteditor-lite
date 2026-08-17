import { EditorConfigurationError } from './alt-editor-lite-error.js';

import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';

/**
 * Rejects invalid operation ownership and form callback configuration.
 *
 * @param options - Editor options to validate before the Host is claimed.
 * @throws EditorConfigurationError when a callback is invalid or ownership is ambiguous.
 */
export function validateOperationConfiguration<
  TRow extends object,
  TFormValues extends object,
>(options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>): void {
  if (options.validateForm !== undefined && typeof options.validateForm !== 'function') {
    throw new EditorConfigurationError('validateForm must be a function.');
  }

  if (
    options.operations?.create !== undefined &&
    options.clientSide?.createRow !== undefined
  ) {
    throw new EditorConfigurationError(
      'Configure either operations.create or clientSide.createRow, not both.',
    );
  }

  if (
    options.operations?.update !== undefined &&
    options.clientSide?.updateRow !== undefined
  ) {
    throw new EditorConfigurationError(
      'Configure either operations.update or clientSide.updateRow, not both.',
    );
  }
}
