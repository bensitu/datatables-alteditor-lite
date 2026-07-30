import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Creates plain-text Remove confirmation content with an explicit target count.
 *
 * @param targetCount - Number of rows captured by the Remove snapshot.
 * @param language - Resolved language used for the warning.
 * @returns Owned confirmation content element.
 */
export function createRemoveConfirmation(
  targetCount: number,
  language: Readonly<AltEditorLiteLanguage>,
): HTMLDivElement {
  const confirmationElement = document.createElement('div');
  const countElement = document.createElement('p');
  const warningElement = document.createElement('p');

  confirmationElement.className = 'dt-alteditor-lite-remove-confirmation';
  countElement.className = 'dt-alteditor-lite-remove-confirmation__count';
  warningElement.className = 'dt-alteditor-lite-remove-confirmation__warning';
  countElement.textContent = `${String(targetCount)} row${
    targetCount === 1 ? '' : 's'
  } selected.`;
  warningElement.textContent = language.dialog.removeMessage;
  confirmationElement.append(countElement, warningElement);

  return confirmationElement;
}
