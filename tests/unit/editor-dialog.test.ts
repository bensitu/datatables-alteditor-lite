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
    `.dt-alteditor-lite-dialog__button--${modifier}`,
  );
  if (buttonElement === null) {
    throw new Error(`Expected the ${modifier} button.`);
  }
  return buttonElement;
}

describe('EditorDialog', () => {
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
      dialogElement.querySelector('.dt-alteditor-lite-dialog__body')?.children,
    ).toHaveLength(0);
    controller.focusInvalidField();
    controller.destroy();
  });

  it('defers Escape handling and rechecks dialog ownership', async () => {
    const { controller, dialogElement } = createDialog();
    const onRequestClose = vi.fn();
    const contentElement = document.createElement('div');
    controller.openConfirmation(contentElement, 'Remove', 'Confirm', {
      onRequestClose,
      onSubmit: vi.fn(),
    });

    const firstCancelEvent = new Event('cancel', { cancelable: true });
    dialogElement.dispatchEvent(firstCancelEvent);
    controller.setBusy(true);
    await Promise.resolve();
    expect(firstCancelEvent.defaultPrevented).toBe(true);
    expect(onRequestClose).not.toHaveBeenCalled();

    controller.setBusy(false);
    const secondCancelEvent = new Event('cancel', { cancelable: true });
    dialogElement.dispatchEvent(secondCancelEvent);
    await Promise.resolve();
    expect(onRequestClose).toHaveBeenCalledWith('escape');

    const staleClose = vi.fn();
    controller.close();
    controller.openConfirmation(document.createElement('div'), 'First', 'Confirm', {
      onRequestClose: staleClose,
      onSubmit: vi.fn(),
    });
    dialogElement.dispatchEvent(new Event('cancel', { cancelable: true }));
    controller.close();
    controller.openConfirmation(document.createElement('div'), 'Second', 'Confirm', {
      onRequestClose: vi.fn(),
      onSubmit: vi.fn(),
    });
    await Promise.resolve();
    expect(staleClose).not.toHaveBeenCalled();
    controller.destroy();
  });

  it('updates the dialog height while the viewport changes', () => {
    const { controller, dialogElement } = createDialog();
    let viewportHeight = 900;
    Object.defineProperty(document.documentElement, 'clientHeight', {
      configurable: true,
      get: () => viewportHeight,
    });

    controller.openConfirmation(document.createElement('div'), 'Remove', 'Confirm', {
      onRequestClose: vi.fn(),
      onSubmit: vi.fn(),
    });
    expect(
      dialogElement.style.getPropertyValue('--dt-alteditor-lite-dialog-max-height'),
    ).toBe('868px');

    viewportHeight = 600;
    window.dispatchEvent(new Event('resize'));
    expect(
      dialogElement.style.getPropertyValue('--dt-alteditor-lite-dialog-max-height'),
    ).toBe('568px');

    controller.close();
    viewportHeight = 500;
    window.dispatchEvent(new Event('resize'));
    expect(
      dialogElement.style.getPropertyValue('--dt-alteditor-lite-dialog-max-height'),
    ).toBe('568px');
    controller.destroy();
    Reflect.deleteProperty(document.documentElement, 'clientHeight');
  });

  it('submits confirmations, blocks backdrop dismissal, and destroys idempotently', () => {
    const { controller, dialogElement } = createDialog();
    const contentElement = document.createElement('div');
    const childElement = document.createElement('span');
    const onSubmit = vi.fn();
    contentElement.append(childElement);
    controller.openConfirmation(contentElement, 'Remove people', 'Remove', {
      onRequestClose: vi.fn(),
      onSubmit,
    });
    const submitButton = getButton(dialogElement, 'submit');

    expect(
      submitButton.classList.contains('dt-alteditor-lite-dialog__button--destructive'),
    ).toBe(true);
    submitButton.click();
    expect(onSubmit).toHaveBeenCalledOnce();

    controller.setSubmitAvailable(false);
    submitButton.click();
    expect(onSubmit).toHaveBeenCalledOnce();

    const childClick = new MouseEvent('click', { bubbles: true, cancelable: true });
    childElement.dispatchEvent(childClick);
    expect(childClick.defaultPrevented).toBe(false);
    const backdropClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    dialogElement.dispatchEvent(backdropClick);
    expect(backdropClick.defaultPrevented).toBe(true);

    controller.destroy();
    expect(dialogElement.isConnected).toBe(false);
    expect(() => {
      controller.destroy();
    }).not.toThrow();
  });
});
