import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  EditorAlreadyInitializedError,
  AltEditorLiteError,
  EditorConfigurationError,
} from '../../src/core/alt-editor-lite-error.js';
import { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import { StandaloneHost } from '../../src/standalone/standalone-host.js';

import {
  createStandaloneTestFixture,
  destroyStandaloneTestFixtures,
  installDialogElementSupport,
  type StandaloneRecord,
} from './standalone-test-fixture.js';

import type { OperationContext } from '../../src/core/alt-editor-lite-options.js';

interface Deferred {
  readonly promise: Promise<void>;
  resolve(): void;
}

function createDeferred(): Deferred {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(): void {
      if (resolvePromise === undefined) {
        throw new Error('Deferred operation has no resolver.');
      }
      resolvePromise();
    },
  };
}

function replaceName(value: string): void {
  const input = document.querySelector<HTMLInputElement>('.alteditor-lite-form input');
  if (input === null) {
    throw new Error('Expected an open Standalone name field.');
  }
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitForm(): void {
  const form = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
  if (form === null) {
    throw new Error('Expected an open Standalone form.');
  }
  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
}

function confirmRemove(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '.alteditor-lite-dialog__button--destructive',
  );
  if (button === null) {
    throw new Error('Expected an open Remove confirmation.');
  }
  button.click();
}

describe('AltEditorLite Standalone CRUD', () => {
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

  it('uses client-side record mappings for Create and Edit', async () => {
    const fixture = createStandaloneTestFixture({
      clientSide: {
        createRow: (values) => ({
          id: 'record-created',
          name: values.name ?? '',
        }),
        updateRow: (original, values) => ({
          ...original,
          name: values.name ?? original.name,
        }),
      },
    });

    await fixture.editor.openCreateDialog();
    replaceName('Created record');
    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-created')?.name).toBe('Created record');

    await fixture.editor.openEditDialog('record-created');
    replaceName('Updated record');
    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-created')?.name).toBe('Updated record');
  });

  it('waits for asynchronous removal before applying consumer state', async () => {
    const deferred = createDeferred();
    const remove = vi.fn(
      (rows: readonly Readonly<StandaloneRecord>[], context: OperationContext) => {
        expect(rows).toHaveLength(1);
        expect(context.operation).toBe('remove');
        return deferred.promise;
      },
    );
    const fixture = createStandaloneTestFixture({ operations: { remove } });

    await fixture.editor.openRemoveDialog(['record-a']);
    confirmRemove();
    await vi.waitFor(() => {
      expect(remove).toHaveBeenCalledOnce();
    });
    expect(fixture.records.has('record-a')).toBe(true);

    deferred.resolve();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.has('record-a')).toBe(false);
    expect(remove.mock.calls[0]?.[0]).toEqual([{ id: 'record-a', name: 'Alpha' }]);
  });

  it('keeps a failed Create operation open for a successful retry', async () => {
    let attempt = 0;
    const fixture = createStandaloneTestFixture({
      operations: {
        create: (values) => {
          attempt += 1;
          if (attempt === 1) {
            throw new AltEditorLiteError({
              code: 'CREATE_RETRY',
              message: 'Creation can be retried.',
              retryable: true,
            });
          }
          return { id: 'record-retried', name: values.name ?? '' };
        },
      },
    });

    await fixture.editor.openCreateDialog();
    replaceName('Retried record');
    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('open');
    });
    expect(fixture.records.has('record-retried')).toBe(false);

    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-retried')?.name).toBe('Retried record');
  });

  it('requires and uses an explicit record provider for local uniqueness', async () => {
    expect(() =>
      createStandaloneTestFixture({
        fields: [{ label: 'Name', name: 'name', type: 'text', unique: true }],
      }),
    ).toThrow(EditorConfigurationError);

    const fixture = createStandaloneTestFixture(
      {
        clientSide: {
          createRow: (values) => ({
            id: 'record-unique',
            name: values.name ?? '',
          }),
        },
        fields: [{ label: 'Name', name: 'name', type: 'text', unique: true }],
      },
      {
        records: () => [...fixture.records].map(([target, row]) => ({ row, target })),
      },
    );

    await fixture.editor.openCreateDialog();
    replaceName('Alpha');
    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('open');
    });
    expect(document.querySelector('.alteditor-lite-field__error')?.textContent).not.toBe(
      '',
    );

    replaceName('Unique record');
    submitForm();
    await vi.waitFor(() => {
      expect(fixture.editor.getState().status).toBe('ready');
    });
    expect(fixture.records.get('record-unique')?.name).toBe('Unique record');
  });

  it('enforces ownership and releases it when the editor is destroyed', () => {
    const ownershipKey = {};
    const row: StandaloneRecord = { id: 'record-a', name: 'Alpha' };
    const createHost = (): StandaloneHost<StandaloneRecord, string> =>
      new StandaloneHost({
        ownershipKey,
        read: () => row,
      });
    const first = new AltEditorLite(createHost(), { fields: [] });

    expect(() => new AltEditorLite(createHost(), { fields: [] })).toThrow(
      EditorAlreadyInitializedError,
    );

    first.destroy();
    const replacement = new AltEditorLite(createHost(), { fields: [] });
    replacement.destroy();
  });
});
