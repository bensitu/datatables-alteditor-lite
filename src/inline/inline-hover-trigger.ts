const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Owns the single cell-local edit button used by hover and touch activation. */
export class InlineHoverTrigger {
  public readonly element: HTMLButtonElement;

  private currentCell_: HTMLTableCellElement | undefined;

  private isDestroyed = false;

  public constructor(label: string) {
    this.element = document.createElement('button');
    this.element.type = 'button';
    this.element.className = 'alteditor-lite-inline-hover__trigger';
    this.element.dataset['alteditorLiteIgnoreInline'] = '';
    this.element.setAttribute('aria-label', label);
    this.element.title = label;

    const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute(
      'd',
      'M16.86 3.49a2.25 2.25 0 0 1 3.18 3.18L8.2 18.51l-4.29.82.82-4.29L16.86 3.49Zm-1.6 3.19 2.12 2.12',
    );
    icon.append(path);
    this.element.append(icon);
  }

  public currentCell(): HTMLTableCellElement | undefined {
    return this.currentCell_;
  }

  public isFocused(): boolean {
    return document.activeElement === this.element;
  }

  public moveTo(cell: HTMLTableCellElement): void {
    if (this.isDestroyed || this.currentCell_ === cell) {
      return;
    }
    this.hide();
    this.currentCell_ = cell;
    cell.classList.add('alteditor-lite-inline-hover-target');
    cell.append(this.element);
  }

  public hide(): void {
    this.currentCell_?.classList.remove('alteditor-lite-inline-hover-target');
    this.currentCell_ = undefined;
    this.element.remove();
  }

  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.hide();
  }
}
