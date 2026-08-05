/** Owns operation-level error markup for an inline field host. */
export class InlineErrorPresenter {
  public readonly element: HTMLDivElement;

  public constructor(
    private readonly host: HTMLElement,
    fieldId: string,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'alteditor-lite-inline__error';
    this.element.id = `${fieldId}-operation-error`;
    this.element.hidden = true;
    this.element.setAttribute('aria-live', 'polite');
    this.element.setAttribute('role', 'alert');
  }

  /** Displays an operation-level error. */
  public show(message: string): void {
    this.host.classList.add('alteditor-lite-inline--invalid');
    this.element.textContent = message;
    this.element.hidden = false;
  }

  /** Clears the current operation-level error. */
  public clear(): void {
    this.host.classList.remove('alteditor-lite-inline--invalid');
    this.element.textContent = '';
    this.element.hidden = true;
  }
}
