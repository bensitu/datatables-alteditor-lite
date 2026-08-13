import { afterEach, describe, expect, it, vi } from 'vitest';

import { DialogFocusScope } from '../../src/dialog/dialog-focus-scope.js';

afterEach(() => {
  document.body.replaceChildren();
});

function createScope(): {
  readonly dialogElement: HTMLDialogElement;
  readonly scope: DialogFocusScope;
  readonly tableElement: HTMLTableElement;
} {
  const tableElement = document.createElement('table');
  const dialogElement = document.createElement('dialog');
  dialogElement.open = true;
  document.body.append(tableElement, dialogElement);
  return {
    dialogElement,
    scope: new DialogFocusScope(dialogElement, tableElement),
    tableElement,
  };
}

describe('DialogFocusScope', () => {
  it('focuses an invalid nested control and restores the opening trigger', () => {
    const { dialogElement, scope } = createScope();
    const triggerElement = document.createElement('button');
    const contentElement = document.createElement('div');
    const invalidGroup = document.createElement('div');
    const invalidInput = document.createElement('input');
    triggerElement.textContent = 'Open';
    invalidGroup.setAttribute('aria-invalid', 'true');
    invalidGroup.append(invalidInput);
    contentElement.append(invalidGroup);
    dialogElement.append(contentElement);
    document.body.prepend(triggerElement);
    triggerElement.focus();

    scope.captureRestoreTarget();
    scope.activate(contentElement);

    expect(document.activeElement).toBe(invalidInput);
    scope.deactivate(true);
    expect(document.activeElement).toBe(triggerElement);

    expect(() => {
      scope.deactivate(true);
    }).not.toThrow();
  });

  it('falls back to the dialog when no focusable control exists', () => {
    const { dialogElement, scope } = createScope();
    const contentElement = document.createElement('div');
    dialogElement.append(contentElement);

    scope.activate(contentElement);

    expect(dialogElement.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(dialogElement);
    scope.destroy();
  });

  it('skips hidden content and uses the dialog cancel action', () => {
    const { dialogElement, scope } = createScope();
    const contentElement = document.createElement('div');
    const hiddenButton = document.createElement('button');
    const ariaHiddenButton = document.createElement('button');
    const cssHiddenContainer = document.createElement('div');
    const cssHiddenButton = document.createElement('button');
    const cancelButton = document.createElement('button');
    hiddenButton.hidden = true;
    ariaHiddenButton.setAttribute('aria-hidden', 'true');
    cssHiddenContainer.style.display = 'none';
    cssHiddenContainer.append(cssHiddenButton);
    cancelButton.className = 'alteditor-lite-dialog__button--cancel';
    contentElement.append(hiddenButton, ariaHiddenButton, cssHiddenContainer);
    dialogElement.append(contentElement, cancelButton);

    scope.focusInitial(contentElement);

    expect(document.activeElement).toBe(cancelButton);
  });

  it('cycles Tab focus in both directions and ignores other keys', () => {
    const { dialogElement, scope } = createScope();
    const contentElement = document.createElement('div');
    const firstButton = document.createElement('button');
    const lastButton = document.createElement('button');
    contentElement.append(firstButton, lastButton);
    dialogElement.append(contentElement);
    scope.activate(contentElement);

    lastButton.focus();
    const forwardTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    dialogElement.dispatchEvent(forwardTab);
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton);

    firstButton.focus();
    const backwardTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
      shiftKey: true,
    });
    dialogElement.dispatchEvent(backwardTab);
    expect(backwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(lastButton);

    dialogElement.tabIndex = -1;
    dialogElement.focus();
    const rootTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    dialogElement.dispatchEvent(rootTab);
    expect(rootTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton);

    const escapeEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    dialogElement.dispatchEvent(escapeEvent);
    expect(escapeEvent.defaultPrevented).toBe(false);
  });

  it('reuses focus endpoints and refreshes them after relevant DOM changes', async () => {
    const { dialogElement, scope } = createScope();
    const contentElement = document.createElement('div');
    const firstButton = document.createElement('button');
    const secondButton = document.createElement('button');
    contentElement.append(firstButton, secondButton);
    dialogElement.append(contentElement);
    const querySelectorAll = vi.spyOn(dialogElement, 'querySelectorAll');
    scope.activate(contentElement);

    secondButton.focus();
    dialogElement.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Tab' }),
    );
    firstButton.focus();
    dialogElement.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Tab',
        shiftKey: true,
      }),
    );
    expect(querySelectorAll).toHaveBeenCalledOnce();

    const lastButton = document.createElement('button');
    contentElement.append(lastButton);
    await Promise.resolve();
    lastButton.focus();
    const nextTab = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    dialogElement.dispatchEvent(nextTab);
    expect(nextTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton);
    expect(querySelectorAll).toHaveBeenCalledTimes(2);
    scope.destroy();
  });

  it('contains focus when no controls exist and restores to the table fallback', () => {
    const { dialogElement, scope, tableElement } = createScope();
    const triggerElement = document.createElement('button');
    document.body.prepend(triggerElement);
    triggerElement.focus();
    scope.captureRestoreTarget();
    triggerElement.remove();
    scope.activate(document.createElement('div'));

    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    dialogElement.dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(dialogElement);

    scope.deactivate(true);
    expect(tableElement.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(tableElement);

    const nextTarget = document.createElement('button');
    document.body.append(nextTarget);
    nextTarget.focus();
    expect(tableElement.getAttribute('tabindex')).toBeNull();
  });
});
