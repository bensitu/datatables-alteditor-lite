/** Returns whether focus remains inside the mounted inline presentation. */
export function ownsInlineFocus(
  host: HTMLElement,
  activeElement: Element | null = document.activeElement,
): boolean {
  return activeElement !== null && host.contains(activeElement);
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
