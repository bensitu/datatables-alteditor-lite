import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { EditorDialog } from '../../src/dialog/editor-dialog.js';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function createDialog(): {
  readonly controller: EditorDialog;
  readonly dialogElement: HTMLDialogElement;
} {
  const tableElement = document.createElement('table');
  document.body.append(tableElement);
  const controller = new EditorDialog(tableElement, 'dialog-test', ENGLISH_LANGUAGE);
  const dialogElement = document.querySelector<HTMLDialogElement>('dialog');
  if (dialogElement === null) {
    throw new Error('Expected an editor dialog.');
  }
  Object.defineProperty(dialogElement, 'showModal', {
    configurable: true,
    value(): void {
      dialogElement.open = true;
    },
  });
  Object.defineProperty(dialogElement, 'close', {
    configurable: true,
    value(): void {
      dialogElement.open = false;
    },
  });
  return { controller, dialogElement };
}

function getButton(
  dialogElement: HTMLDialogElement,
  modifier: 'cancel' | 'submit',
): HTMLButtonElement {
  const buttonElement = dialogElement.querySelector<HTMLButtonElement>(
    `.alteditor-lite-dialog__button--${modifier}`,
  );
  if (buttonElement === null) {
    throw new Error(`Expected the ${modifier} button.`);
  }
  return buttonElement;
}

describe('EditorDialog', () => {
  it('requires the document body before construction', () => {
    const documentBody = document.body;
    const tableElement = document.createElement('table');
    documentBody.remove();

    try {
      expect(() => {
        new EditorDialog(tableElement, 'missing-body', ENGLISH_LANGUAGE);
      }).toThrow(
        'AltEditorLite requires a document body before a dialog can be created.',
      );
    } finally {
      document.documentElement.append(documentBody);
    }
  });

  it('owns form submission, busy state, errors, and cancellation', () => {
    const { controller, dialogElement } = createDialog();
    const formElement = document.createElement('form');
    const invalidInput = document.createElement('input');
    const onSubmit = vi.fn();
    const onRequestClose = vi.fn();
    formElement.id = 'owned-form';
    invalidInput.setAttribute('aria-invalid', 'true');
    formElement.append(invalidInput);

    controller.openForm(formElement, 'Create person', 'Save', {
      onRequestClose,
      onSubmit,
    });

    const submitButton = getButton(dialogElement, 'submit');
    const cancelButton = getButton(dialogElement, 'cancel');
    expect(dialogElement.open).toBe(true);
    expect(dialogElement.hasAttribute('style')).toBe(false);
    expect(submitButton.getAttribute('form')).toBe('owned-form');
    expect(submitButton.textContent).toBe('Save');

    controller.setBusy(true);
    formElement.dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    cancelButton.click();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(submitButton.disabled).toBe(true);

    controller.setBusy(false);
    controller.setSubmitAvailable(false);
    formElement.dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    expect(onSubmit).not.toHaveBeenCalled();

    controller.setSubmitAvailable(true);
    formElement.dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );
    expect(onSubmit).toHaveBeenCalledOnce();

    controller.showError('Operation failed.');
    expect(dialogElement.querySelector('[role="alert"]')?.textContent).toBe(
      'Operation failed.',
    );
    controller.clearError();
    controller.focusInvalidField();
    expect(document.activeElement).toBe(invalidInput);

    cancelButton.click();
    expect(onRequestClose).toHaveBeenCalledWith('cancel');
    controller.close();
    expect(dialogElement.open).toBe(false);
    expect(
      dialogElement.querySelector('.alteditor-lite-dialog__body')?.children,
    ).toHaveLength(0);
    controller.focusInvalidField();
    controller.destroy();
  });

  it('handles Escape synchronously while the dialog is interactive', () => {
    const { controller, dialogElement } = createDialog();
    const onRequestClose = vi.fn();
    const contentElement = document.createElement('div');
    controller.openConfirmation(contentElement, 'Remove', 'Confirm', {
      onRequestClose,
      onSubmit: vi.fn(),
    });

    const firstCancelEvent = new Event('cancel', { cancelable: true });
    controller.setBusy(true);
    dialogElement.dispatchEvent(firstCancelEvent);
    expect(firstCancelEvent.defaultPrevented).toBe(true);
    expect(onRequestClose).not.toHaveBeenCalled();

    controller.setBusy(false);
    const secondCancelEvent = new Event('cancel', { cancelable: true });
    dialogElement.dispatchEvent(secondCancelEvent);
    expect(onRequestClose).toHaveBeenCalledWith('escape');
    controller.destroy();
  });

  it('submits confirmations and destroys idempotently', () => {
    const { controller, dialogElement } = createDialog();
    const contentElement = document.createElement('div');
    const onSubmit = vi.fn();
    controller.openConfirmation(contentElement, 'Remove people', 'Remove', {
      onRequestClose: vi.fn(),
      onSubmit,
    });
    const submitButton = getButton(dialogElement, 'submit');

    expect(
      submitButton.classList.contains('alteditor-lite-dialog__button--destructive'),
    ).toBe(true);
    submitButton.click();
    expect(onSubmit).toHaveBeenCalledOnce();

    controller.setSubmitAvailable(false);
    submitButton.click();
    expect(onSubmit).toHaveBeenCalledOnce();

    controller.destroy();
    expect(dialogElement.isConnected).toBe(false);
    expect(() => {
      controller.destroy();
    }).not.toThrow();
    expect(() => {
      controller.close();
    }).not.toThrow();
  });

  it('replaces open content without retaining the previous submit listener', () => {
    const { controller, dialogElement } = createDialog();
    const confirmationSubmit = vi.fn();
    const formSubmit = vi.fn();
    controller.openConfirmation(document.createElement('div'), 'Remove', 'Remove', {
      onRequestClose: vi.fn(),
      onSubmit: confirmationSubmit,
    });

    const formElement = document.createElement('form');
    formElement.id = 'replacement-form';
    controller.openForm(formElement, 'Edit', 'Save', {
      onRequestClose: vi.fn(),
      onSubmit: formSubmit,
    });
    formElement.dispatchEvent(
      new SubmitEvent('submit', { bubbles: true, cancelable: true }),
    );

    expect(confirmationSubmit).not.toHaveBeenCalled();
    expect(formSubmit).toHaveBeenCalledOnce();
    controller.close();
    expect(getButton(dialogElement, 'submit').hasAttribute('form')).toBe(false);
    controller.destroy();
  });
});
