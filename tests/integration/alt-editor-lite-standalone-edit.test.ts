import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';

import {
  createStandaloneTestFixture,
  destroyStandaloneTestFixtures,
  installDialogElementSupport,
  type StandaloneRecord,
  type StandaloneValues,
} from './standalone-test-fixture.js';

import type { EditOperationContext } from '../../src/core/alt-editor-lite-options.js';
import type { EditorValues } from '../../src/core/editor-values.js';

function replaceName(value: string): void {
  const input = document.querySelector<HTMLInputElement>('.alteditor-lite-form input');
  if (input === null) {
    throw new Error('Expected the Standalone name field.');
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitDialog(): void {
  const form = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
  if (form === null) {
    throw new Error('Expected an open Standalone form.');
  }
  form.requestSubmit();
}

describe('AltEditorLite Standalone Edit', () => {
  let restoreDialogElement: () => void;

  beforeAll(() => {
    restoreDialogElement = installDialogElementSupport();
  });

  afterAll(() => {
    restoreDialogElement();
  });

  afterEach(() => {
    destroyStandaloneTestFixtures();
  });

  it('persists and applies a canonical record before publishing success', async () => {
    const lifecycle: string[] = [];
    let originalFromPersistence: Readonly<{ id: string; name: string }> | undefined;
    const update = vi.fn(
      (
        values: Readonly<EditorValues<StandaloneValues>>,
        original: Readonly<StandaloneRecord>,
        context: EditOperationContext,
      ) => {
        lifecycle.push('persist');
        originalFromPersistence = original;
        expect(context.target).toEqual({ fieldNames: ['name'], key: 'record-a' });
        return { ...original, name: values.name ?? original.name };
      },
    );
    const applyUpdate = vi.fn((target: string, row: StandaloneRecord) => {
      lifecycle.push('apply');
      fixture.records.set(target, row);
      return target;
    });
    const afterSuccess = vi.fn(() => {
      lifecycle.push('afterSuccess');
    });
    const fixture = createStandaloneTestFixture(
      {
        hooks: { afterSuccess },
        operations: { update },
      },
      { applyUpdate },
    );
    fixture.eventTarget.addEventListener('alteditor-lite:success', () => {
      lifecycle.push('success');
    });

    await fixture.editor.openEditDialog('record-a');
    expect(document.querySelector('table')).toBeNull();
    replaceName('Canonical Alpha');
    submitDialog();

    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-a')?.name).toBe('Canonical Alpha');
    expect(originalFromPersistence).toEqual({ id: 'record-a', name: 'Alpha' });
    expect(originalFromPersistence).not.toBe(fixture.records.get('record-a'));
    expect(Object.isFrozen(originalFromPersistence)).toBe(true);
    expect(lifecycle).toEqual(['persist', 'apply', 'success', 'afterSuccess']);
  });

  it('reports a Host application failure after persistence completes', async () => {
    let shouldFail = true;
    const onError = vi.fn();
    const success = vi.fn();
    const fixture = createStandaloneTestFixture(
      {
        hooks: { onError },
        operations: {
          update: (values, original) => ({
            ...original,
            name: values.name ?? original.name,
          }),
        },
      },
      {
        applyUpdate: (target, row) => {
          if (shouldFail) {
            shouldFail = false;
            throw new AltEditorLiteError({
              code: 'STATE_WRITE_FAILED',
              message: 'Consumer state was not updated.',
              retryable: true,
            });
          }
          fixture.records.set(target, row);
          return target;
        },
      },
    );
    fixture.eventTarget.addEventListener('alteditor-lite:success', success);

    await fixture.editor.openEditDialog('record-a');
    replaceName('Retried Alpha');
    submitDialog();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('open');
    });
    expect(fixture.records.get('record-a')?.name).toBe('Alpha');
    expect(success).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'STATE_WRITE_FAILED' }),
      expect.objectContaining({ committed: true, phase: 'commit' }),
    );

    submitDialog();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-a')?.name).toBe('Retried Alpha');
    expect(success).toHaveBeenCalledOnce();
  });

  it('presents retryable operation field errors without applying a row', async () => {
    let attempt = 0;
    const applyUpdate = vi.fn((target: string, row: StandaloneRecord) => {
      fixture.records.set(target, row);
      return target;
    });
    const fixture = createStandaloneTestFixture(
      {
        operations: {
          update: (values, original) => {
            attempt += 1;
            if (attempt === 1) {
              throw new AltEditorLiteError({
                code: 'VALIDATION',
                fieldErrors: { name: 'Duplicate name.' },
                message: 'The record could not be saved.',
                retryable: true,
              });
            }
            return { ...original, name: values.name ?? original.name };
          },
        },
      },
      { applyUpdate },
    );

    await fixture.editor.openEditDialog('record-a');
    replaceName('Duplicate');
    submitDialog();

    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('open');
    });
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(fixture.records.get('record-a')?.name).toBe('Alpha');
    expect(document.querySelector('[data-field-name="name"]')?.textContent).toContain(
      'Duplicate name.',
    );
    expect(document.querySelector('.alteditor-lite-dialog__errors')?.textContent).toBe(
      'The record could not be saved.',
    );
    expect(
      document.querySelector<HTMLButtonElement>('.alteditor-lite-dialog__button--submit')
        ?.disabled,
    ).toBe(false);

    replaceName('Available');
    submitDialog();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(applyUpdate).toHaveBeenCalledOnce();
    expect(fixture.records.get('record-a')?.name).toBe('Available');
  });

  it('aborts persistence when the active dialog is closed', async () => {
    let operationSignal: AbortSignal | undefined;
    const applyUpdate = vi.fn();
    const fixture = createStandaloneTestFixture(
      {
        operations: {
          update: (_values, _original, context) => {
            operationSignal = context.signal;
            return new Promise((_resolve, reject) => {
              context.signal.addEventListener(
                'abort',
                () => {
                  reject(
                    new Error('Standalone persistence was cancelled.', {
                      cause: context.signal.reason,
                    }),
                  );
                },
                { once: true },
              );
            });
          },
        },
      },
      { applyUpdate },
    );

    await fixture.editor.openEditDialog('record-a');
    replaceName('Cancelled Alpha');
    submitDialog();
    await vi.waitFor(() => {
      expect(operationSignal).toBeDefined();
    });
    await fixture.editor.closeDialog();

    expect(operationSignal?.aborted).toBe(true);
    expect(applyUpdate).not.toHaveBeenCalled();
    expect(fixture.records.get('record-a')?.name).toBe('Alpha');
    expect(fixture.editor.getState().status).toBe('ready');
  });
});
