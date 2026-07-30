import { EditorConfigurationError } from './alt-editor-lite-error.js';

import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';

/**
 * Rejects ambiguous persistence and client-side capability ownership.
 *
 * @param options - Editor options to validate before the table is claimed.
 * @throws EditorConfigurationError when Create or Update has two owners.
 */
export function validateOperationConfiguration<
  TRow extends object,
  TFormValues extends object,
>(options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>): void {
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
