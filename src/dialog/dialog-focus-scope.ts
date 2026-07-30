const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isFocusable(element: HTMLElement): boolean {
  return (
    element.hidden === false &&
    element.closest('[hidden]') === null &&
    element.getAttribute('aria-hidden') !== 'true'
  );
}

/**
 * Owns keyboard focus entry, containment, and restoration for one dialog.
 */
export class DialogFocusScope {
  private restoreTarget: HTMLElement | null = null;

  private isActive = false;

  /**
   * @param dialogElement - Native dialog whose focus is scoped.
   * @param tableElement - Table used when the original trigger disappears.
   */
  public constructor(
    private readonly dialogElement: HTMLDialogElement,
    private readonly tableElement: HTMLTableElement,
  ) {}

  /**
   * Captures the external trigger before `showModal()` moves focus.
   */
  public captureRestoreTarget(): void {
    const activeElement = document.activeElement;
    this.restoreTarget = activeElement instanceof HTMLElement ? activeElement : null;
  }

  /**
   * Installs the Tab scope and focuses dialog content after the dialog opens.
   *
   * @param contentElement - Newly rendered form or confirmation content.
   */
  public activate(contentElement: HTMLElement): void {
    this.isActive = true;
    this.dialogElement.addEventListener('keydown', this.handleKeyDown);
    this.focusInitial(contentElement);
  }

  /**
   * Focuses the first invalid control or the first interactive content.
   *
   * @param contentElement - Current form or confirmation content.
   */
  public focusInitial(contentElement: HTMLElement): void {
    const invalidElement = contentElement.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const invalidControl =
      invalidElement?.matches('input, select, textarea, button') === true
        ? invalidElement
        : invalidElement?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const initialControl =
      invalidControl ??
      [...contentElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].find(
        isFocusable,
      ) ??
      this.dialogElement.querySelector<HTMLButtonElement>(
        '.dt-alteditor-lite-dialog__button--cancel:not([disabled])',
      );

    if (initialControl === null) {
      this.dialogElement.tabIndex = -1;
      this.dialogElement.focus();
    } else {
      initialControl.focus();
    }
  }

  /**
   * Removes focus containment and optionally restores the opening trigger.
   *
   * @param shouldRestore - Whether focus should return outside the dialog.
   */
  public deactivate(shouldRestore: boolean): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    this.dialogElement.removeEventListener('keydown', this.handleKeyDown);

    if (shouldRestore) {
      const restoreTarget =
        this.restoreTarget?.isConnected === true ? this.restoreTarget : this.tableElement;

      if (restoreTarget === this.tableElement) {
        this.tableElement.setAttribute('tabindex', '-1');
      }

      restoreTarget.focus();
    }

    this.restoreTarget = null;
  }

  /**
   * Removes the scope without retaining a trigger reference.
   */
  public destroy(): void {
    this.deactivate(false);
    this.restoreTarget = null;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = [
      ...this.dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ].filter(isFocusable);

    if (focusableElements.length === 0) {
      event.preventDefault();
      this.dialogElement.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);
    const activeElement = document.activeElement;

    if (
      event.shiftKey &&
      (activeElement === firstElement || !this.dialogElement.contains(activeElement))
    ) {
      event.preventDefault();
      lastElement?.focus();
    } else if (
      !event.shiftKey &&
      (activeElement === lastElement || !this.dialogElement.contains(activeElement))
    ) {
      event.preventDefault();
      firstElement?.focus();
    }
  };
}
