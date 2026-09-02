import { runCleanupSteps } from '../core/run-cleanup-steps.js';

import { appendDialogElement } from './append-dialog-element.js';
import { DialogFocusScope } from './dialog-focus-scope.js';
import { createEditorDialogShell, type EditorDialogShell } from './dialog-shell.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { BeforeCloseReason } from '../core/alt-editor-lite-options.js';

/**
 * Callbacks owned by the editor while an operation dialog is open.
 */
export interface EditorDialogCallbacks {
  readonly onSubmit: () => void;
  readonly onRequestClose: (reason: BeforeCloseReason) => void;
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

  /**
   * Creates and attaches one reusable native dialog element.
   *
   * @param focusFallback - Host element used when the opening target disappears.
   * @param instanceId - Instance-scoped DOM prefix.
   * @param language - Complete resolved language.
   */
  public constructor(
    focusFallback: HTMLElement,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.shell = createEditorDialogShell(instanceId, language);
    this.focusScope = new DialogFocusScope(this.shell.dialogElement, focusFallback);
    this.shell.dialogElement.addEventListener('cancel', this.handleNativeCancel);
    this.shell.cancelButton.addEventListener('click', this.handleCancelClick);
    appendDialogElement(this.shell.dialogElement);
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
    this.focusScope.captureRestoreTarget();
    this.shell.dialogElement.showModal();
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

  /** Restores focus inside the active dialog after a close request is declined. */
  public ensureFocus(): void {
    if (
      this.shell.dialogElement.open &&
      !this.shell.dialogElement.contains(document.activeElement)
    ) {
      this.focusScope.focusInitial(this.formElement ?? this.shell.bodyElement);
    }
  }

  /**
   * Closes the native dialog and restores the opening trigger.
   */
  public close(): void {
    if (this.isDestroyed) {
      return;
    }
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
    this.callbacks = undefined;
    runCleanupSteps([
      () => {
        this.detachForm();
        this.shell.submitButton.removeEventListener('click', this.handleConfirmation);
        this.shell.dialogElement.removeEventListener('cancel', this.handleNativeCancel);
        this.shell.cancelButton.removeEventListener('click', this.handleCancelClick);
      },
      () => {
        if (this.shell.dialogElement.open) {
          this.shell.dialogElement.close();
        }
      },
      () => {
        this.focusScope.deactivate(true);
      },
      () => {
        this.focusScope.destroy();
      },
      () => {
        this.shell.dialogElement.remove();
      },
    ]);
  }

  private detachForm(): void {
    this.formElement?.removeEventListener('submit', this.handleSubmit);
    this.formElement = undefined;
    this.shell.submitButton.removeAttribute('form');
  }

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
