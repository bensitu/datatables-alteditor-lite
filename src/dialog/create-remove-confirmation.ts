import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { RemoveConfirmationRenderer } from '../core/editing-options.js';

/**
 * Creates default or consumer-provided Remove confirmation content.
 *
 * @param rows - Current readonly Remove snapshots.
 * @param language - Resolved language used for the warning.
 * @param renderer - Optional text or DOM content renderer.
 * @returns Owned confirmation content element.
 */
export function createRemoveConfirmation<TRow extends object>(
  rows: readonly Readonly<TRow>[],
  language: Readonly<AltEditorLiteLanguage>,
  renderer?: RemoveConfirmationRenderer<TRow>,
): HTMLDivElement {
  const confirmationElement = document.createElement('div');
  const targetCount = rows.length;

  confirmationElement.className = 'alteditor-lite-remove-confirmation';
  if (renderer !== undefined) {
    confirmationElement.classList.add('alteditor-lite-remove-confirmation--custom');
    const content: unknown = renderer(
      Object.freeze({ count: targetCount, language, rows }),
    );
    if (typeof content === 'string') {
      confirmationElement.textContent = content;
      return confirmationElement;
    }
    if (content instanceof HTMLElement || content instanceof DocumentFragment) {
      confirmationElement.append(content);
      return confirmationElement;
    }
    throw new EditorConfigurationError(
      'editing.dialog.removeConfirmation must return text or a DOM node.',
    );
  }

  const countElement = document.createElement('p');
  const warningElement = document.createElement('p');

  countElement.className = 'alteditor-lite-remove-confirmation__count';
  warningElement.className = 'alteditor-lite-remove-confirmation__warning';
  countElement.textContent = language.dialog.removeCount
    .split('{count}')
    .join(String(targetCount));
  warningElement.textContent = language.dialog.removeMessage;
  confirmationElement.append(countElement, warningElement);

  return confirmationElement;
}
