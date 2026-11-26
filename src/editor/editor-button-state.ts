import { EditorSelectionUnavailableError } from '../core/alt-editor-lite-error.js';
import { READ_SELECTED_ROW_COUNT } from '../core/editor-button-integration.js';
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
  if (
    READ_SELECTED_ROW_COUNT in host &&
    typeof host[READ_SELECTED_ROW_COUNT] === 'function'
  ) {
    const count = (host as { [READ_SELECTED_ROW_COUNT](): number | undefined })[
      READ_SELECTED_ROW_COUNT
    ]();
    hasSelect = count !== undefined;
    selectedRowCount = count ?? 0;
  } else if (hasHostSelectionCapability<TTarget>(host)) {
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
