import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

/** Appends an editor dialog after verifying that the document is ready. */
export function appendDialogElement(dialogElement: HTMLDialogElement): void {
  const documentBody = document.body as HTMLElement | null;
  if (documentBody === null) {
    throw new EditorConfigurationError(
      'AltEditorLite requires a document body before a dialog can be created.',
    );
  }
  documentBody.append(dialogElement);
}
