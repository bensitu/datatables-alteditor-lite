/**
 * Keeps the active option visible inside the in-dialog listbox.
 *
 * @param optionElement - Active option, when one exists.
 */
export function revealSearchSelectOption(optionElement: HTMLElement | undefined): void {
  if (optionElement !== undefined && typeof optionElement.scrollIntoView === 'function') {
    optionElement.scrollIntoView({ block: 'nearest' });
  }
}
