import { afterEach, describe, expect, it } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { EditorAlertDialog } from '../../src/dialog/editor-alert-dialog.js';

afterEach(() => {
  document.body.replaceChildren();
});

describe('EditorAlertDialog', () => {
  it('renders plain text, closes from Escape, and settles the open request', async () => {
    const table = document.createElement('table');
    document.body.append(table);
    const alert = new EditorAlertDialog(table, 'alert-test', ENGLISH_LANGUAGE);
    const dialog = document.querySelector<HTMLDialogElement>(
      '.dt-alteditor-lite-dialog--alert',
    );
    if (dialog === null) {
      throw new Error('Expected an alert dialog.');
    }
    Object.defineProperty(dialog, 'showModal', {
      configurable: true,
      value(): void {
        dialog.open = true;
      },
    });
    Object.defineProperty(dialog, 'close', {
      configurable: true,
      value(): void {
        dialog.open = false;
      },
    });

    let didSettle = false;
    const opened = alert
      .open({ message: '<strong>Plain message</strong>', title: 'Check value' })
      .then(() => {
        didSettle = true;
      });
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.dt-alteditor-lite-dialog__message')?.textContent).toBe(
      '<strong>Plain message</strong>',
    );
    expect(dialog.querySelector('strong')).toBeNull();

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await opened;
    expect(didSettle).toBe(true);
    expect(dialog.open).toBe(false);
    alert.destroy();
  });

  it('restores the opening target when destroyed while open', () => {
    const trigger = document.createElement('button');
    const table = document.createElement('table');
    document.body.append(trigger, table);
    trigger.focus();
    const alert = new EditorAlertDialog(table, 'destroy-alert-test', ENGLISH_LANGUAGE);
    const dialog = document.querySelector<HTMLDialogElement>(
      '.dt-alteditor-lite-dialog--alert',
    );
    if (dialog === null) {
      throw new Error('Expected an alert dialog.');
    }
    Object.defineProperty(dialog, 'showModal', {
      configurable: true,
      value(): void {
        dialog.open = true;
      },
    });
    Object.defineProperty(dialog, 'close', {
      configurable: true,
      value(): void {
        dialog.open = false;
      },
    });

    void alert.open({ message: 'Message', title: 'Title' });
    alert.destroy();

    expect(document.activeElement).toBe(trigger);
  });
});
