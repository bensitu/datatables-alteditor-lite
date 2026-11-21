import { EditorSelectionUnavailableError } from '../core/alt-editor-lite-error.js';
import { hasHostSelectionCapability } from '../host/editor-host.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorButtonStateInput } from '../core/editor-button-integration.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
import type { EditorHost } from '../host/editor-host.js';

/** Reads selection state and capabilities for the host's integration controls. */
export function readEditorButtonState<TRow extends object, TTarget>(
  host: EditorHost<TRow, TTarget>,
  capabilities: Readonly<EditorCapabilities>,
  language: Readonly<AltEditorLiteLanguage>,
  isReady: boolean,
): Readonly<EditorButtonStateInput> {
  let hasSelect = false;
  let selectedRowCount = 0;
  if (hasHostSelectionCapability<TTarget>(host)) {
    try {
      selectedRowCount = host.getSelectedTargets().length;
      hasSelect = true;
    } catch (error: unknown) {
      if (!(error instanceof EditorSelectionUnavailableError)) {
        throw error;
      }
    }
  }
  return {
    capabilities,
    hasCreate: capabilities.createDialog,
    hasSelect,
    isReady,
    language,
    selectedRowCount,
  };
}
