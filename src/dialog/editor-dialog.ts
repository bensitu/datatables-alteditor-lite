import { DialogFocusScope } from './dialog-focus-scope.js';
import { positionDialog } from './dialog-positioning.js';
import { createEditorDialogShell, type EditorDialogShell } from './dialog-shell.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { EditorCloseReason } from '../core/editor-event.js';

/**
 * Callbacks owned by the editor while an operation dialog is open.
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

  private readonly shell: EditorDialogShell;

  private callbacks: EditorDialogCallbacks | undefined;

  private formElement: HTMLFormElement | undefined;

  private isBusy = false;

  private isDestroyed = false;

  private isSubmitAvailable = true;

  private attachedVisualViewport: VisualViewport | undefined;

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
    this.shell = createEditorDialogShell(instanceId, language);
    this.focusScope = new DialogFocusScope(this.shell.dialogElement, tableElement);
    this.shell.dialogElement.addEventListener('cancel', this.handleNativeCancel);
    this.shell.cancelButton.addEventListener('click', this.handleCancelClick);
    document.body.append(this.shell.dialogElement);
  }

  /**
   * Shows populated form content modally and establishes initial focus.
   *
   * @param formElement - Owned Create or Edit form.
   * @param title - Plain-text dialog title.
   * @param submitLabel - Plain-text primary action label.
   * @param callbacks - Submit and close request callbacks.
   */
  public openForm(
    formElement: HTMLFormElement,
    title: string,
    submitLabel: string,
    callbacks: EditorDialogCallbacks,
  ): void {
    this.close();
    this.configureOpenContent(formElement, title, submitLabel, false, callbacks);
    this.formElement = formElement;
    this.shell.submitButton.setAttribute('form', formElement.id);
    this.shell.submitButton.type = 'submit';
    formElement.addEventListener('submit', this.handleSubmit);
    this.showConfiguredContent(formElement);
  }

  /**
   * Shows Remove confirmation content without creating a FormController.
   *
   * @param contentElement - Owned plain-text confirmation content.
   * @param title - Plain-text dialog title.
   * @param submitLabel - Plain-text destructive action label.
   * @param callbacks - Confirm and close request callbacks.
   */
  public openConfirmation(
    contentElement: HTMLElement,
    title: string,
    submitLabel: string,
    callbacks: EditorDialogCallbacks,
  ): void {
    this.close();
    this.configureOpenContent(contentElement, title, submitLabel, true, callbacks);
    this.shell.submitButton.removeAttribute('form');
    this.shell.submitButton.type = 'button';
    this.shell.submitButton.addEventListener('click', this.handleConfirmation);
    this.showConfiguredContent(contentElement);
  }

  private configureOpenContent(
    contentElement: HTMLElement,
    title: string,
    submitLabel: string,
    isDestructive: boolean,
    callbacks: EditorDialogCallbacks,
  ): void {
    this.callbacks = callbacks;
    this.isSubmitAvailable = true;
    this.shell.titleElement.textContent = title;
    this.shell.submitButton.textContent = submitLabel;
    this.shell.submitButton.classList.toggle(
      'alteditor-lite-dialog__button--destructive',
      isDestructive,
    );
    this.shell.bodyElement.replaceChildren(contentElement);
    this.setBusy(false);
    this.clearError();
  }

  private showConfiguredContent(contentElement: HTMLElement): void {
    positionDialog(this.shell.dialogElement);
    this.focusScope.captureRestoreTarget();
    this.shell.dialogElement.showModal();
    this.attachViewportListeners();
    this.focusScope.activate(contentElement);
  }

  /**
   * Prevents repeated submission and non-programmatic closure.
   *
   * @param isBusy - Whether an operation owns the dialog.
   */
  public setBusy(isBusy: boolean): void {
    this.isBusy = isBusy;
    this.shell.submitButton.disabled = isBusy || !this.isSubmitAvailable;
    this.shell.cancelButton.disabled = isBusy;
    this.shell.dialogElement.setAttribute('aria-busy', String(isBusy));
  }

  /**
   * Controls whether the primary action can retry after a failure.
   *
   * @param isAvailable - Whether retrying can be meaningful.
   */
  public setSubmitAvailable(isAvailable: boolean): void {
    this.isSubmitAvailable = isAvailable;
    this.shell.submitButton.disabled = this.isBusy || !isAvailable;
  }

  /**
   * Displays an operation-level error in the dialog alert region.
   *
   * @param message - Plain-text error message.
   */
  public showError(message: string): void {
    this.shell.errorElement.textContent = message;
    this.shell.errorElement.hidden = false;
  }

  /**
   * Clears the operation-level alert region.
   */
  public clearError(): void {
    this.shell.errorElement.textContent = '';
    this.shell.errorElement.hidden = true;
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
    this.detachViewportListeners();
    this.detachForm();
    this.shell.submitButton.removeEventListener('click', this.handleConfirmation);
    this.setBusy(false);
    this.setSubmitAvailable(true);
    this.clearError();

    if (this.shell.dialogElement.open) {
      this.shell.dialogElement.close();
    }

    this.focusScope.deactivate(true);
    this.shell.bodyElement.replaceChildren();
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
    this.detachViewportListeners();
    this.detachForm();
    this.shell.submitButton.removeEventListener('click', this.handleConfirmation);

    if (this.shell.dialogElement.open) {
      this.shell.dialogElement.close();
    }

    this.focusScope.deactivate(true);
    this.focusScope.destroy();
    this.shell.dialogElement.removeEventListener('cancel', this.handleNativeCancel);
    this.shell.cancelButton.removeEventListener('click', this.handleCancelClick);
    this.shell.dialogElement.remove();
    this.callbacks = undefined;
  }

  private detachForm(): void {
    this.formElement?.removeEventListener('submit', this.handleSubmit);
    this.formElement = undefined;
    this.shell.submitButton.removeAttribute('form');
  }

  private attachViewportListeners(): void {
    window.addEventListener('resize', this.handleViewportChange);
    this.attachedVisualViewport = window.visualViewport ?? undefined;
    this.attachedVisualViewport?.addEventListener('resize', this.handleViewportChange);
  }

  private detachViewportListeners(): void {
    window.removeEventListener('resize', this.handleViewportChange);
    this.attachedVisualViewport?.removeEventListener('resize', this.handleViewportChange);
    this.attachedVisualViewport = undefined;
  }

  private readonly handleViewportChange = (): void => {
    if (!this.isDestroyed && this.shell.dialogElement.open) {
      positionDialog(this.shell.dialogElement);
    }
  };

  private readonly handleSubmit = (event: SubmitEvent): void => {
    event.preventDefault();
    if (!this.isBusy && this.isSubmitAvailable) {
      this.callbacks?.onSubmit();
    }
  };

  private readonly handleConfirmation = (): void => {
    if (!this.isBusy && this.isSubmitAvailable) {
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
    if (!this.isBusy && this.callbacks !== undefined) {
      this.callbacks.onRequestClose('escape');
    }
  };
}
