import { InlineOriginalContent } from './inline-original-content.js';

import type { InlineEditView, InlineEditViewHandlers } from './inline-edit-view.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** Compact control-only view mounted in one DataTables cell. */
export class InlineCellHost<TFormValues extends object> implements InlineEditView {
  public readonly element: HTMLDivElement;

  private readonly primaryControl:
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

  private originalContent: InlineOriginalContent | undefined;

  private mountedCell: HTMLTableCellElement | undefined;

  private isDestroyed = false;

  public constructor(
    private readonly controller: ManagedFieldController<TFormValues>,
    private readonly field: Readonly<FieldConfig<TFormValues>>,
    private readonly tableElement: HTMLTableElement,
    _handlers: Readonly<InlineEditViewHandlers>,
    className?: string,
  ) {
    this.element = document.createElement('div');
    const controlElement = document.createElement('div');

    this.element.className = 'alteditor-lite-inline';
    this.element.dataset['alteditorLiteInline'] = '';
    this.element.setAttribute('aria-busy', 'false');
    controlElement.className = 'alteditor-lite-inline__control';

    if (className !== undefined) {
      this.element.classList.add(
        ...className.split(/\s+/u).filter((token) => token.length > 0),
      );
    }

    controlElement.append(controller.element);
    this.element.append(controlElement);
    this.primaryControl = controller.element.querySelector('input, select, textarea');
  }

  public focus(): void {
    this.controller.focus();
  }

  public mount(cell: HTMLTableCellElement): void {
    if (this.mountedCell !== undefined || this.isDestroyed) {
      return;
    }
    this.mountedCell = cell;
    this.originalContent = InlineOriginalContent.capture(
      cell,
      this.element,
      this.tableElement,
    );
    cell.classList.add('alteditor-lite-cell--editing');
    cell.append(this.element);
  }

  public unmount(options: Readonly<{ restoreOriginalContent: boolean }>): void {
    const cell = this.mountedCell;
    this.mountedCell = undefined;
    cell?.classList.remove('alteditor-lite-cell--editing');
    if (options.restoreOriginalContent) {
      this.originalContent?.restore();
    } else {
      this.originalContent?.discard();
    }
    this.originalContent = undefined;
    this.element.remove();
  }

  public setBusy(isBusy: boolean): void {
    this.element.classList.toggle('alteditor-lite-inline--busy', isBusy);
    this.element.setAttribute('aria-busy', String(isBusy));

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

  public setInvalid(isInvalid: boolean): void {
    this.element.classList.toggle('alteditor-lite-inline--invalid', isInvalid);
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.originalContent?.discard();
    this.originalContent = undefined;
    this.mountedCell?.classList.remove('alteditor-lite-cell--editing');
    this.mountedCell = undefined;
    this.element.remove();
  }
}
