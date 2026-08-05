import { InlineErrorPresenter } from './inline-error-presenter.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** DOM host and busy/error presentation for one inline field controller. */
export class InlineCellHost<TFormValues extends object> {
  public readonly element: HTMLDivElement;

  private readonly errorPresenter: InlineErrorPresenter;

  private readonly originalContent = document.createDocumentFragment();

  private readonly statusElement: HTMLDivElement;

  private readonly primaryControl:
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

  private mountedCell: HTMLTableCellElement | undefined;

  public constructor(
    private readonly controller: ManagedFieldController<TFormValues>,
    private readonly field: Readonly<FieldConfig<TFormValues>>,
    fieldId: string,
    language: Readonly<AltEditorLiteLanguage>,
    className?: string,
  ) {
    this.element = document.createElement('div');
    const controlElement = document.createElement('div');
    this.statusElement = document.createElement('div');
    this.errorPresenter = new InlineErrorPresenter(this.element, fieldId);

    this.element.className = 'alteditor-lite-inline';
    this.element.dataset['alteditorLiteInline'] = '';
    this.element.setAttribute('aria-busy', 'false');
    controlElement.className = 'alteditor-lite-inline__control';
    this.statusElement.className = 'alteditor-lite-inline__status';
    this.statusElement.setAttribute('aria-live', 'polite');
    this.statusElement.textContent = language.inline.editStarted;

    if (className !== undefined) {
      this.element.classList.add(
        ...className.split(/\s+/u).filter((token) => token.length > 0),
      );
    }

    controlElement.append(controller.element);
    this.element.append(controlElement, this.errorPresenter.element, this.statusElement);
    this.primaryControl = controller.element.querySelector('input, select, textarea');
    this.primaryControl?.setAttribute('aria-label', this.field.label ?? this.field.name);
  }

  /** Focuses the controller's primary control. */
  public focus(): void {
    this.controller.focus();
  }

  /** Replaces a cell's current content while preserving the original nodes. */
  public mount(cellNode: HTMLTableCellElement): void {
    if (this.mountedCell !== undefined) {
      return;
    }
    this.mountedCell = cellNode;
    while (cellNode.firstChild !== null) {
      this.originalContent.append(cellNode.firstChild);
    }
    cellNode.classList.add('alteditor-lite-cell--editing');
    cellNode.append(this.element);
  }

  /** Removes the host and either restores or discards the preserved cell nodes. */
  public unmount(restoreOriginalContent: boolean): void {
    const cellNode = this.mountedCell;
    this.mountedCell = undefined;
    if (cellNode === undefined) {
      this.element.remove();
      this.originalContent.replaceChildren();
      return;
    }

    cellNode.classList.remove('alteditor-lite-cell--editing');
    if (restoreOriginalContent) {
      cellNode.replaceChildren(this.originalContent);
    } else {
      this.originalContent.replaceChildren();
      this.element.remove();
    }
  }

  /** Displays an operation-level error without replacing field validation text. */
  public showError(message: string): void {
    this.errorPresenter.show(message);
  }

  /** Clears only the operation-level error. */
  public clearError(): void {
    this.errorPresenter.clear();
  }

  /** Freezes or restores the control while persistence owns the candidate. */
  public setBusy(isBusy: boolean, language: Readonly<AltEditorLiteLanguage>): void {
    this.element.classList.toggle('alteditor-lite-inline--busy', isBusy);
    this.element.setAttribute('aria-busy', String(isBusy));
    this.statusElement.textContent = isBusy ? language.inline.saving : '';

    if (
      this.field.type === 'search-select' ||
      this.primaryControl instanceof HTMLSelectElement ||
      (this.primaryControl instanceof HTMLInputElement &&
        this.primaryControl.type === 'checkbox')
    ) {
      this.controller.setDisabled(isBusy);
      return;
    }
    if (
      this.primaryControl instanceof HTMLInputElement ||
      this.primaryControl instanceof HTMLTextAreaElement
    ) {
      this.primaryControl.readOnly =
        isBusy || ('readonly' in this.field && this.field.readonly);
    }
  }
}
