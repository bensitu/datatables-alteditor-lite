import { DialogFocusScope } from './dialog-focus-scope.js';
import { positionDialog } from './dialog-positioning.js';
import { createDialogTemplate, type DialogTemplate } from './dialog-template.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorCloseReason } from '../core/editor-event.js';

/**
 * Callbacks owned by the editor while a Create dialog is open.
 */
export interface EditorDialogCallbacks {
  readonly onSubmit: () => void;
  readonly onRequestClose: (reason: Exclude<EditorCloseReason, 'success'>) => void;
}

/**
 * Native dialog controller used by an editor instance.
 */
export class EditorDialog {
  private readonly focusScope: DialogFocusScope;

  private readonly template: DialogTemplate;

  private callbacks: EditorDialogCallbacks | undefined;

  private formElement: HTMLFormElement | undefined;

  private isBusy = false;

  private isDestroyed = false;

  /**
   * Creates and attaches one reusable native dialog element.
   *
   * @param tableElement - Table used for focus fallback.
   * @param instanceId - Instance-scoped DOM prefix.
   * @param language - Complete resolved language.
   */
  public constructor(
    tableElement: HTMLTableElement,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.template = createDialogTemplate(instanceId, language);
    this.focusScope = new DialogFocusScope(this.template.dialogElement, tableElement);
    this.template.dialogElement.addEventListener('cancel', this.handleNativeCancel);
    this.template.dialogElement.addEventListener('click', this.handleBackdropClick);
    this.template.cancelButton.addEventListener('click', this.handleCancelClick);
    document.body.append(this.template.dialogElement);
  }

  /**
   * Shows a populated Create form modally and establishes initial focus.
   *
   * @param formElement - Owned Create form.
   * @param title - Plain-text dialog title.
   * @param callbacks - Submit and close request callbacks.
   */
  public open(
    formElement: HTMLFormElement,
    title: string,
    callbacks: EditorDialogCallbacks,
  ): void {
    this.formElement = formElement;
    this.callbacks = callbacks;
    this.template.titleElement.textContent = title;
    this.template.bodyElement.replaceChildren(formElement);
    this.template.submitButton.setAttribute('form', formElement.id);
    formElement.addEventListener('submit', this.handleSubmit);
    positionDialog(this.template.dialogElement);
    this.focusScope.captureRestoreTarget();
    this.template.dialogElement.showModal();
    this.focusScope.activate(formElement);
  }

  /**
   * Prevents repeated submission and non-programmatic closure.
   *
   * @param isBusy - Whether an operation owns the dialog.
   */
  public setBusy(isBusy: boolean): void {
    this.isBusy = isBusy;
    this.template.submitButton.disabled = isBusy;
    this.template.cancelButton.disabled = isBusy;
    this.template.dialogElement.setAttribute('aria-busy', String(isBusy));
  }

  /**
   * Displays an operation-level error in the dialog alert region.
   *
   * @param message - Plain-text error message.
   */
  public showError(message: string): void {
    this.template.errorElement.textContent = message;
    this.template.errorElement.hidden = false;
  }

  /**
   * Clears the operation-level alert region.
   */
  public clearError(): void {
    this.template.errorElement.textContent = '';
    this.template.errorElement.hidden = true;
  }

  /**
   * Moves focus to the first field currently marked invalid.
   */
  public focusInvalidField(): void {
    if (this.formElement !== undefined) {
      this.focusScope.focusInitial(this.formElement);
    }
  }

  /**
   * Closes the native dialog and restores the opening trigger.
   */
  public close(): void {
    this.detachForm();
    this.setBusy(false);
    this.clearError();

    if (this.template.dialogElement.open) {
      this.template.dialogElement.close();
    }

    this.focusScope.deactivate(true);
    this.template.bodyElement.replaceChildren();
    this.callbacks = undefined;
  }

  /**
   * Removes all owned listeners and DOM. Repeated calls are harmless.
   */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.detachForm();

    if (this.template.dialogElement.open) {
      this.template.dialogElement.close();
    }

    this.focusScope.deactivate(true);
    this.focusScope.destroy();
    this.template.dialogElement.removeEventListener('cancel', this.handleNativeCancel);
    this.template.dialogElement.removeEventListener('click', this.handleBackdropClick);
    this.template.cancelButton.removeEventListener('click', this.handleCancelClick);
    this.template.dialogElement.remove();
    this.callbacks = undefined;
  }

  private detachForm(): void {
    this.formElement?.removeEventListener('submit', this.handleSubmit);
    this.formElement = undefined;
  }

  private readonly handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!this.isBusy) {
      this.callbacks?.onSubmit();
    }
  };

  private readonly handleCancelClick = (): void => {
    if (!this.isBusy) {
      this.callbacks?.onRequestClose('cancel');
    }
  };

  private readonly handleNativeCancel = (event: Event): void => {
    event.preventDefault();
    if (!this.isBusy) {
      window.setTimeout(() => {
        if (!this.isBusy) {
          this.callbacks?.onRequestClose('escape');
        }
      }, 0);
    }
  };

  private readonly handleBackdropClick = (event: MouseEvent): void => {
    if (event.target === this.template.dialogElement) {
      event.preventDefault();
    }
  };
}
