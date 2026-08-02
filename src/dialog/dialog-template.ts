import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Owned elements that make up the native editor dialog.
 */
export interface DialogTemplate {
  readonly dialogElement: HTMLDialogElement;
  readonly bodyElement: HTMLDivElement;
  readonly errorElement: HTMLDivElement;
  readonly titleElement: HTMLHeadingElement;
  readonly submitButton: HTMLButtonElement;
  readonly cancelButton: HTMLButtonElement;
}

/**
 * Creates the fixed native dialog structure without parsing HTML strings.
 *
 * @param instanceId - Instance-scoped DOM prefix.
 * @param language - Complete resolved language.
 * @returns Owned dialog elements.
 */
export function createDialogTemplate(
  instanceId: string,
  language: Readonly<AltEditorLiteLanguage>,
): DialogTemplate {
  const dialogElement = document.createElement('dialog');
  const surfaceElement = document.createElement('div');
  const headerElement = document.createElement('header');
  const titleElement = document.createElement('h2');
  const bodyElement = document.createElement('div');
  const errorElement = document.createElement('div');
  const footerElement = document.createElement('footer');
  const cancelButton = document.createElement('button');
  const submitButton = document.createElement('button');

  dialogElement.className = 'dt-alteditor-lite-dialog';
  dialogElement.id = `${instanceId}-dialog`;
  dialogElement.setAttribute('aria-labelledby', `${instanceId}-dialog-title`);
  dialogElement.setAttribute('aria-modal', 'true');
  surfaceElement.className = 'dt-alteditor-lite-dialog__surface';
  headerElement.className = 'dt-alteditor-lite-dialog__header';
  titleElement.className = 'dt-alteditor-lite-dialog__title';
  titleElement.id = `${instanceId}-dialog-title`;
  bodyElement.className = 'dt-alteditor-lite-dialog__body';
  errorElement.className = 'dt-alteditor-lite-dialog__errors';
  errorElement.hidden = true;
  errorElement.setAttribute('role', 'alert');
  footerElement.className = 'dt-alteditor-lite-dialog__footer';

  cancelButton.className =
    'dt-alteditor-lite-dialog__button dt-alteditor-lite-dialog__button--cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = language.actions.cancel;

  submitButton.className =
    'dt-alteditor-lite-dialog__button dt-alteditor-lite-dialog__button--submit';
  submitButton.type = 'submit';
  submitButton.textContent = language.actions.submit;

  headerElement.append(titleElement);
  footerElement.append(cancelButton, submitButton);
  surfaceElement.append(headerElement, bodyElement, errorElement, footerElement);
  dialogElement.append(surfaceElement);

  return {
    bodyElement,
    cancelButton,
    dialogElement,
    errorElement,
    submitButton,
    titleElement,
  };
}
