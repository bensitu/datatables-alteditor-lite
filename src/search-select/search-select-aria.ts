/**
 * Applies the static ARIA combobox relationship.
 *
 * @param inputElement - Search input.
 * @param listboxElement - Owned local listbox.
 * @param isSearchEnabled - Whether text filtering is available.
 */
export function initializeSearchSelectAria(
  inputElement: HTMLInputElement,
  listboxElement: HTMLElement,
  isSearchEnabled = true,
): void {
  inputElement.setAttribute('role', 'combobox');
  inputElement.setAttribute('aria-autocomplete', isSearchEnabled ? 'list' : 'none');
  inputElement.setAttribute('aria-expanded', 'false');
  inputElement.setAttribute('aria-controls', listboxElement.id);
  inputElement.setAttribute('autocomplete', 'off');
  listboxElement.setAttribute('role', 'listbox');
}

/**
 * Updates open and active-option ARIA state.
 *
 * @param inputElement - Search input.
 * @param isExpanded - Whether the listbox is visible.
 * @param activeOptionId - Active descendant ID, when present.
 */
export function updateSearchSelectAria(
  inputElement: HTMLInputElement,
  isExpanded: boolean,
  activeOptionId: string | undefined,
): void {
  inputElement.setAttribute('aria-expanded', String(isExpanded));

  if (activeOptionId === undefined) {
    inputElement.removeAttribute('aria-activedescendant');
  } else {
    inputElement.setAttribute('aria-activedescendant', activeOptionId);
  }
}

/**
 * Applies option semantics without exposing consumer HTML.
 *
 * @param optionElement - Rendered plain-text option.
 * @param isSelected - Whether its typed value is selected.
 * @param isDisabled - Whether it can be chosen.
 */
export function updateSearchSelectOptionAria(
  optionElement: HTMLElement,
  isSelected: boolean,
  isDisabled: boolean,
): void {
  optionElement.setAttribute('role', 'option');
  optionElement.setAttribute('aria-selected', String(isSelected));
  optionElement.setAttribute('aria-disabled', String(isDisabled));
}
