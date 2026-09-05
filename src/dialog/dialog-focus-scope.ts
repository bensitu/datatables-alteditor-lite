const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'audio[controls]',
  'button:not([disabled])',
  '[contenteditable]:not([contenteditable="false"])',
  'details > summary:first-of-type',
  'embed',
  'iframe',
  'input:not([type="hidden"]):not([disabled])',
  'object',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'video[controls]',
].join(',');

const FOCUS_RELEVANT_ATTRIBUTES = [
  'aria-hidden',
  'class',
  'contenteditable',
  'controls',
  'disabled',
  'hidden',
  'href',
  'inert',
  'open',
  'style',
  'tabindex',
  'type',
] as const;

const SEARCH_SELECT_LISTBOX_SELECTOR = '.alteditor-lite-search-select__listbox';

function computedStyleFor(
  element: HTMLElement,
  computedStyleByElement: WeakMap<HTMLElement, CSSStyleDeclaration>,
): CSSStyleDeclaration {
  const existingStyle = computedStyleByElement.get(element);
  if (existingStyle !== undefined) {
    return existingStyle;
  }

  const computedStyle = getComputedStyle(element);
  computedStyleByElement.set(element, computedStyle);
  return computedStyle;
}

function isFocusable(
  element: HTMLElement,
  computedStyleByElement: WeakMap<HTMLElement, CSSStyleDeclaration>,
): boolean {
  for (
    let currentElement: HTMLElement | null = element;
    currentElement !== null;
    currentElement = currentElement.parentElement
  ) {
    if (
      currentElement.hidden === true ||
      currentElement.inert ||
      currentElement.getAttribute('aria-hidden') === 'true'
    ) {
      return false;
    }

    const computedStyle = computedStyleFor(currentElement, computedStyleByElement);
    if (
      computedStyle.display === 'none' ||
      computedStyle.visibility === 'hidden' ||
      computedStyle.visibility === 'collapse'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Owns keyboard focus entry, containment, and restoration for one dialog.
 */
export class DialogFocusScope {
  private focusableElementsCache: readonly HTMLElement[] | undefined;

  private focusMutationObserver: MutationObserver | undefined;

  private restoreTarget: HTMLElement | null = null;

  private isActive = false;

  private ownsTemporaryFallbackTabIndex = false;

  /**
   * @param dialogElement - Native dialog whose focus is scoped.
   * @param fallbackElement - Host element used when the original trigger disappears.
   */
  public constructor(
    private readonly dialogElement: HTMLDialogElement,
    private readonly fallbackElement: HTMLElement,
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
    this.focusableElementsCache = undefined;
    this.focusMutationObserver?.disconnect();
    this.focusMutationObserver = new MutationObserver(this.handleFocusMutations);
    this.focusMutationObserver.observe(this.dialogElement, {
      attributeFilter: [...FOCUS_RELEVANT_ATTRIBUTES],
      attributes: true,
      childList: true,
      subtree: true,
    });
    this.dialogElement.addEventListener('keydown', this.handleKeyDown);
    this.getFocusableElements();
    this.focusInitial(contentElement);
  }

  /**
   * Focuses the first invalid control or the first interactive content.
   *
   * @param contentElement - Current form or confirmation content.
   */
  public focusInitial(contentElement: HTMLElement): void {
    const computedStyleByElement = new WeakMap<HTMLElement, CSSStyleDeclaration>();
    const invalidElement = contentElement.querySelector<HTMLElement>(
      '[aria-invalid="true"]',
    );
    const invalidControl =
      invalidElement?.matches('input, select, textarea, button') === true
        ? invalidElement
        : invalidElement?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    const initialControl =
      (invalidControl !== null &&
      invalidControl !== undefined &&
      isFocusable(invalidControl, computedStyleByElement)
        ? invalidControl
        : undefined) ??
      [...contentElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].find(
        (element) => isFocusable(element, computedStyleByElement),
      ) ??
      this.dialogElement.querySelector<HTMLButtonElement>(
        '.alteditor-lite-dialog__button--cancel:not([disabled])',
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
    this.focusMutationObserver?.disconnect();
    this.focusMutationObserver = undefined;
    this.focusableElementsCache = undefined;

    if (shouldRestore) {
      const restoreTarget =
        this.restoreTarget?.isConnected === true
          ? this.restoreTarget
          : this.fallbackElement;

      if (restoreTarget === this.fallbackElement) {
        this.focusFallback();
      } else {
        restoreTarget.focus();
      }
    }

    this.restoreTarget = null;
  }

  /**
   * Removes the scope without retaining a trigger reference.
   */
  public destroy(): void {
    this.deactivate(false);
    this.restoreFallbackFocusability();
    this.restoreTarget = null;
  }

  private focusFallback(): void {
    if (this.fallbackElement.getAttribute('tabindex') === null) {
      this.fallbackElement.setAttribute('tabindex', '-1');
      this.ownsTemporaryFallbackTabIndex = true;
      this.fallbackElement.addEventListener('blur', this.restoreFallbackFocusability);
    }

    this.fallbackElement.focus();
    if (document.activeElement !== this.fallbackElement) {
      this.restoreFallbackFocusability();
    }
  }

  private readonly restoreFallbackFocusability = (): void => {
    if (!this.ownsTemporaryFallbackTabIndex) {
      return;
    }

    this.ownsTemporaryFallbackTabIndex = false;
    this.fallbackElement.removeEventListener('blur', this.restoreFallbackFocusability);
    if (this.fallbackElement.getAttribute('tabindex') === '-1') {
      this.fallbackElement.removeAttribute('tabindex');
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') {
      return;
    }

    this.applyPendingFocusMutations();
    const focusableElements = this.getFocusableElements();

    if (focusableElements.length === 0) {
      event.preventDefault();
      this.dialogElement.tabIndex = -1;
      this.dialogElement.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const hasContainedFocus =
      activeElement !== this.dialogElement && this.dialogElement.contains(activeElement);

    if (event.shiftKey && (activeElement === firstElement || !hasContainedFocus)) {
      event.preventDefault();
      lastElement?.focus();
    } else if (!event.shiftKey && (activeElement === lastElement || !hasContainedFocus)) {
      event.preventDefault();
      firstElement?.focus();
    }
  };

  private readonly handleFocusMutations = (
    mutationRecords: readonly MutationRecord[],
  ): void => {
    if (mutationRecords.some((record) => this.affectsFocusableElements(record))) {
      this.focusableElementsCache = undefined;
    }
  };

  private affectsFocusableElements(mutationRecord: MutationRecord): boolean {
    const mutationTarget = mutationRecord.target;
    return !(
      mutationTarget instanceof Element &&
      mutationTarget.closest(SEARCH_SELECT_LISTBOX_SELECTOR) !== null
    );
  }

  private applyPendingFocusMutations(): void {
    const pendingMutations = this.focusMutationObserver?.takeRecords() ?? [];
    this.handleFocusMutations(pendingMutations);
  }

  private getFocusableElements(): readonly HTMLElement[] {
    if (this.focusableElementsCache !== undefined) {
      return this.focusableElementsCache;
    }

    const computedStyleByElement = new WeakMap<HTMLElement, CSSStyleDeclaration>();
    this.focusableElementsCache = [
      ...this.dialogElement.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ].filter((element) => isFocusable(element, computedStyleByElement));
    return this.focusableElementsCache;
  }
}
