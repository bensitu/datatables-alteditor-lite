import { DialogFocusScope } from './dialog-focus-scope.js';
import { positionDialog } from './dialog-positioning.js';
import {
  createAlertDialogTemplate,
  type AlertDialogTemplate,
} from './dialog-template.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/** Plain-text content displayed by an editor alert. */
export interface EditorAlertContent {
  readonly title: string;
  readonly message: string;
}

/** Reusable modal alert built on the editor dialog infrastructure. */
export class EditorAlertDialog {
  private readonly focusScope: DialogFocusScope;

  private readonly template: AlertDialogTemplate;

  private resolveOpen: (() => void) | undefined;

  private attachedVisualViewport: VisualViewport | undefined;

  private isDestroyed = false;

  public constructor(
    tableElement: HTMLTableElement,
    instanceId: string,
    language: Readonly<AltEditorLiteLanguage>,
  ) {
    this.template = createAlertDialogTemplate(instanceId, language);
    this.focusScope = new DialogFocusScope(this.template.dialogElement, tableElement);
    this.template.dialogElement.addEventListener('cancel', this.handleCancel);
    this.template.closeButton.addEventListener('click', this.handleClose);
    document.body.append(this.template.dialogElement);
  }

  public open(content: Readonly<EditorAlertContent>): Promise<void> {
    if (this.isDestroyed) {
      return Promise.resolve();
    }
    if (this.template.dialogElement.open) {
      this.close();
    }

    this.template.titleElement.textContent = content.title;
    this.template.messageElement.textContent = content.message;
    positionDialog(this.template.dialogElement);
    this.focusScope.captureRestoreTarget();
    this.template.dialogElement.showModal();
    this.attachViewportListeners();
    this.focusScope.activate(this.template.bodyElement);
    return new Promise<void>((resolve) => {
      this.resolveOpen = resolve;
    });
  }

  public close(): void {
    if (!this.template.dialogElement.open && this.resolveOpen === undefined) {
      return;
    }
    this.detachViewportListeners();
    if (this.template.dialogElement.open) {
      this.template.dialogElement.close();
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
    if (this.template.dialogElement.open) {
      this.template.dialogElement.close();
    }
    this.resolveOpen?.();
    this.resolveOpen = undefined;
    this.focusScope.deactivate(true);
    this.focusScope.destroy();
    this.template.dialogElement.removeEventListener('cancel', this.handleCancel);
    this.template.closeButton.removeEventListener('click', this.handleClose);
    this.template.dialogElement.remove();
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
    if (this.template.dialogElement.open) {
      positionDialog(this.template.dialogElement);
    }
  };
}
