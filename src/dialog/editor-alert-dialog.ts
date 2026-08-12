import { DialogFocusScope } from './dialog-focus-scope.js';
import { positionDialog } from './dialog-positioning.js';
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

  private attachedVisualViewport: VisualViewport | undefined;

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
    document.body.append(this.shell.dialogElement);
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
    positionDialog(this.shell.dialogElement);
    this.focusScope.captureRestoreTarget();
    this.shell.dialogElement.showModal();
    this.attachViewportListeners();
    this.focusScope.activate(this.shell.bodyElement);
    return new Promise<void>((resolve) => {
      this.resolveOpen = resolve;
    });
  }

  public close(): void {
    if (!this.shell.dialogElement.open && this.resolveOpen === undefined) {
      return;
    }
    this.detachViewportListeners();
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
    this.detachViewportListeners();
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

  private readonly handleClose = (): void => {
    this.close();
  };

  private readonly handleCancel = (event: Event): void => {
    event.preventDefault();
    this.close();
  };

  private readonly handleViewportChange = (): void => {
    if (this.shell.dialogElement.open) {
      positionDialog(this.shell.dialogElement);
    }
  };
}
