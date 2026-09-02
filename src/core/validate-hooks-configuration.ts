import { EditorConfigurationError } from './alt-editor-lite-error.js';

import type { AltEditorLiteOptions } from './alt-editor-lite-options.js';

const hookNames = [
  'beforeOpen',
  'beforeSubmit',
  'beforeClose',
  'afterSuccess',
  'onError',
] as const;

/** Validates optional lifecycle callbacks before any Host resources are claimed. */
export function validateHooksConfiguration<
  TRow extends object,
  TFormValues extends object,
>(options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>): void {
  for (const hookName of hookNames) {
    const hook = options.hooks?.[hookName];
    if (hook !== undefined && typeof hook !== 'function') {
      throw new EditorConfigurationError(`hooks.${hookName} must be a function.`);
    }
  }
}
