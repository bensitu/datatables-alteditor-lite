const ABOVE_LISTBOX_CLASS = 'alteditor-lite-search-select__listbox--above';
const AVAILABLE_HEIGHT_PROPERTY = '--alteditor-lite-search-select-available-height';
const CLIPPING_OVERFLOW_VALUES = new Set(['auto', 'clip', 'hidden', 'scroll']);

interface VerticalBounds {
  readonly bottom: number;
  readonly top: number;
}

function getVerticalBounds(anchorElement: HTMLElement): VerticalBounds | undefined {
  const ownerDocument = anchorElement.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (ownerWindow === null) {
    return undefined;
  }

  const visualViewport = ownerWindow.visualViewport;
  let top = visualViewport?.offsetTop ?? 0;
  let bottom =
    top + (visualViewport?.height ?? ownerDocument.documentElement.clientHeight);

  for (
    let ancestor = anchorElement.parentElement;
    ancestor !== null;
    ancestor = ancestor.parentElement
  ) {
    const overflowY = ownerWindow.getComputedStyle(ancestor).overflowY;
    if (!CLIPPING_OVERFLOW_VALUES.has(overflowY)) {
      continue;
    }

    const ancestorRect = ancestor.getBoundingClientRect();
    const contentTop = ancestorRect.top + ancestor.clientTop;
    top = Math.max(top, contentTop);
    bottom = Math.min(bottom, contentTop + ancestor.clientHeight);
  }

  return bottom > top ? { bottom, top } : undefined;
}

/** Clears measured placement values when the listbox closes. */
export function resetSearchSelectListboxPosition(listboxElement: HTMLElement): void {
  listboxElement.classList.remove(ABOVE_LISTBOX_CLASS);
  listboxElement.style.removeProperty(AVAILABLE_HEIGHT_PROPERTY);
}

/**
 * Places an open listbox within the visible intersection of its viewport and
 * clipping ancestors.
 */
export function positionSearchSelectListbox(
  anchorElement: HTMLElement,
  listboxElement: HTMLElement,
): void {
  const scrollTop = listboxElement.scrollTop;
  resetSearchSelectListboxPosition(listboxElement);

  const bounds = getVerticalBounds(anchorElement);
  if (bounds === undefined) {
    return;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const listboxRect = listboxElement.getBoundingClientRect();
  if (anchorRect.height <= 0 || listboxRect.height <= 0) {
    return;
  }

  const gap = Math.max(0, listboxRect.top - anchorRect.bottom);
  const spaceBelow = Math.max(0, bounds.bottom - anchorRect.bottom - gap);
  const spaceAbove = Math.max(0, anchorRect.top - bounds.top - gap);
  const shouldPlaceAbove = listboxRect.height > spaceBelow && spaceAbove > spaceBelow;
  const availableHeight = shouldPlaceAbove ? spaceAbove : spaceBelow;

  listboxElement.classList.toggle(ABOVE_LISTBOX_CLASS, shouldPlaceAbove);
  listboxElement.style.setProperty(
    AVAILABLE_HEIGHT_PROPERTY,
    `${String(Math.floor(availableHeight))}px`,
  );
  listboxElement.scrollTop = scrollTop;
}

/**
 * Keeps the active option visible inside its listbox.
 *
 * @param optionElement - Active option, when one exists.
 */
export function revealSearchSelectOption(
  listboxElement: HTMLElement,
  optionElement: HTMLElement | undefined,
): void {
  if (optionElement === undefined) {
    return;
  }

  const optionTop = optionElement.offsetTop;
  const optionBottom = optionTop + optionElement.offsetHeight;
  const visibleTop = listboxElement.scrollTop;
  const visibleBottom = visibleTop + listboxElement.clientHeight;

  if (optionTop < visibleTop) {
    listboxElement.scrollTop = optionTop;
  } else if (optionBottom > visibleBottom) {
    listboxElement.scrollTop = optionBottom - listboxElement.clientHeight;
  }
}
