import { appendDialogElement } from './append-dialog-element.js';
import { DialogFocusScope } from './dialog-focus-scope.js';
import { createAlertDialogShell, type AlertDialogShell } from './dialog-shell.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/** Plain-text content displayed by an editor alert. */
export interface EditorAlertContent {
  readonly title: string;
  readonly message: string;
}

/** Reusable modal alert built on the editor dialog infrastructure. */
export class EditorAlertDialog {
  private readonly focusScope: DialogFocusScope;

  private readonly shell: AlertDialogShell;

  private resolveOpen: (() => void) | undefined;

  private isDestroyed = false;

  public constructor(
    tableElement: HTMLTableElement,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.shell = createAlertDialogShell(instanceId, language);
    this.focusScope = new DialogFocusScope(this.shell.dialogElement, tableElement);
    this.shell.dialogElement.addEventListener('cancel', this.handleCancel);
    this.shell.closeButton.addEventListener('click', this.handleClose);
    appendDialogElement(this.shell.dialogElement);
  }

  public open(content: Readonly<EditorAlertContent>): Promise<void> {
    if (this.isDestroyed) {
      return Promise.resolve();
    }
    if (this.shell.dialogElement.open) {
      this.close();
    }

    this.shell.titleElement.textContent = content.title;
    this.shell.messageElement.textContent = content.message;
    this.focusScope.captureRestoreTarget();
    this.shell.dialogElement.showModal();
    this.focusScope.activate(this.shell.bodyElement);
    return new Promise<void>((resolve) => {
      this.resolveOpen = resolve;
    });
  }

  public close(): void {
    if (!this.shell.dialogElement.open && this.resolveOpen === undefined) {
      return;
    }
    if (this.shell.dialogElement.open) {
      this.shell.dialogElement.close();
    }
    this.focusScope.deactivate(true);
    const resolve = this.resolveOpen;
    this.resolveOpen = undefined;
    resolve?.();
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    if (this.shell.dialogElement.open) {
      this.shell.dialogElement.close();
    }
    this.resolveOpen?.();
    this.resolveOpen = undefined;
    this.focusScope.deactivate(true);
    this.focusScope.destroy();
    this.shell.dialogElement.removeEventListener('cancel', this.handleCancel);
    this.shell.closeButton.removeEventListener('click', this.handleClose);
    this.shell.dialogElement.remove();
  }

  private readonly handleClose = (): void => {
    this.close();
  };

  private readonly handleCancel = (event: Event): void => {
    event.preventDefault();
    this.close();
  };
}
