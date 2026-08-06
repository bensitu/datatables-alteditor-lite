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

/** Shared native dialog structure used by form and alert presentations. */
export interface DialogShellTemplate {
  readonly dialogElement: HTMLDialogElement;
  readonly bodyElement: HTMLDivElement;
  readonly footerElement: HTMLElement;
  readonly titleElement: HTMLHeadingElement;
}

/** Creates the common accessible dialog shell. */
export function createDialogShell(
  dialogId: string,
  titleId: string,
): DialogShellTemplate {
  const dialogElement = document.createElement('dialog');
  const surfaceElement = document.createElement('div');
  const headerElement = document.createElement('header');
  const titleElement = document.createElement('h2');
  const bodyElement = document.createElement('div');
  const footerElement = document.createElement('footer');

  dialogElement.className = 'dt-alteditor-lite-dialog';
  dialogElement.id = dialogId;
  dialogElement.setAttribute('aria-labelledby', titleId);
  dialogElement.setAttribute('aria-modal', 'true');
  surfaceElement.className = 'dt-alteditor-lite-dialog__surface';
  headerElement.className = 'dt-alteditor-lite-dialog__header';
  titleElement.className = 'dt-alteditor-lite-dialog__title';
  titleElement.id = titleId;
  bodyElement.className = 'dt-alteditor-lite-dialog__body';
  footerElement.className = 'dt-alteditor-lite-dialog__footer';

  headerElement.append(titleElement);
  surfaceElement.append(headerElement, bodyElement, footerElement);
  dialogElement.append(surfaceElement);

  return { bodyElement, dialogElement, footerElement, titleElement };
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
  const shell = createDialogShell(`${instanceId}-dialog`, `${instanceId}-dialog-title`);
  const errorElement = document.createElement('div');
  const cancelButton = document.createElement('button');
  const submitButton = document.createElement('button');
  errorElement.className = 'dt-alteditor-lite-dialog__errors';
  errorElement.hidden = true;
  errorElement.setAttribute('role', 'alert');

  cancelButton.className =
    'dt-alteditor-lite-dialog__button dt-alteditor-lite-dialog__button--cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = language.actions.cancel;

  submitButton.className =
    'dt-alteditor-lite-dialog__button dt-alteditor-lite-dialog__button--submit';
  submitButton.type = 'submit';
  submitButton.textContent = language.actions.submit;

  shell.footerElement.append(cancelButton, submitButton);
  shell.bodyElement.after(errorElement);

  return {
    bodyElement: shell.bodyElement,
    cancelButton,
    dialogElement: shell.dialogElement,
    errorElement,
    submitButton,
    titleElement: shell.titleElement,
  };
}

/** Owned elements used by a plain-text alert dialog. */
export interface AlertDialogTemplate extends DialogShellTemplate {
  readonly closeButton: HTMLButtonElement;
  readonly messageElement: HTMLParagraphElement;
}

/** Creates the alert presentation on the shared dialog shell. */
export function createAlertDialogTemplate(
  instanceId: string,
  language: Readonly<AltEditorLiteLanguage>,
): AlertDialogTemplate {
  const shell = createDialogShell(
    `${instanceId}-alert-dialog`,
    `${instanceId}-alert-dialog-title`,
  );
  const messageElement = document.createElement('p');
  const closeButton = document.createElement('button');

  shell.dialogElement.classList.add('dt-alteditor-lite-dialog--alert');
  messageElement.className = 'dt-alteditor-lite-dialog__message';
  closeButton.className =
    'dt-alteditor-lite-dialog__button dt-alteditor-lite-dialog__button--cancel';
  closeButton.type = 'button';
  closeButton.textContent = language.actions.close;
  shell.bodyElement.append(messageElement);
  shell.footerElement.append(closeButton);

  return { ...shell, closeButton, messageElement };
}
