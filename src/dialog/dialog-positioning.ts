/**
 * Updates the dialog's available block size from the current viewport.
 *
 * @param dialogElement - Native top-layer dialog.
 */
export function positionDialog(dialogElement: HTMLDialogElement): void {
  const viewportHeight =
    window.visualViewport?.height ?? document.documentElement.clientHeight;
  const availableHeight = Math.max(240, Math.floor(viewportHeight - 32));
  dialogElement.style.setProperty(
    '--alteditor-lite-dialog-max-height',
    `${String(availableHeight)}px`,
  );
}
