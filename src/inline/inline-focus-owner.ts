import type { Api } from 'datatables.net';

/** Returns whether focus remains inside the mounted inline presentation. */
export function ownsInlineFocus(
  host: HTMLElement,
  activeElement: Element | null = document.activeElement,
): boolean {
  return activeElement !== null && host.contains(activeElement);
}

/** Restores focus to a logical cell, with the table as a safe fallback. */
export function focusInlineCellOrTable<TRow extends object>(
  table: Api<TRow>,
  tableElement: HTMLTableElement,
  cellNode: HTMLTableCellElement | undefined,
): void {
  if (cellNode?.isConnected === true) {
    const cellApi = table.cell(cellNode) as unknown as {
      focus?: () => unknown;
    };
    if (typeof cellApi.focus === 'function') {
      cellApi.focus();
      return;
    }
    focusWithTemporaryTabIndex(cellNode);
    return;
  }
  focusWithTemporaryTabIndex(tableElement);
}

function focusWithTemporaryTabIndex(element: HTMLElement): void {
  const existingTabIndex = element.getAttribute('tabindex');
  if (element.tabIndex < 0 && existingTabIndex === null) {
    element.setAttribute('tabindex', '-1');
  }
  element.focus();
  if (existingTabIndex === null) {
    element.removeAttribute('tabindex');
  }
}

/** Returns focus to a still-connected element outside the closing host. */
export function restoreInlineOriginFocus(
  host: HTMLElement,
  originalActiveElement: Element | null,
): void {
  if (
    originalActiveElement instanceof HTMLElement &&
    originalActiveElement.isConnected &&
    !host.contains(originalActiveElement)
  ) {
    originalActiveElement.focus();
  }
}
