import type { AltEditorLiteLanguage } from './alt-editor-lite-language.js';
import type { EditorCapabilities } from './editor-capabilities.js';

export const READ_EDITOR_BUTTON_STATE = Symbol.for(
  'datatables-alteditor-lite.read-editor-button-state.v1',
);

/** Inputs used to derive optional Buttons state without retaining an editor. */
export interface EditorButtonStateInput {
  readonly capabilities: Readonly<EditorCapabilities>;
  readonly hasCreate: boolean;
  readonly hasSelect: boolean;
  readonly isReady: boolean;
  readonly selectedRowCount: number;
  readonly language: Readonly<AltEditorLiteLanguage>;
}
