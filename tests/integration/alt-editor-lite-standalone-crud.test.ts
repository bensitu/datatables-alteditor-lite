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

import type {
  BeforeCloseContext,
  OperationContext,
} from '../../src/core/alt-editor-lite-options.js';
import type { RemoveConfirmationContext } from '../../src/core/editing-options.js';

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

  it('treats a retained Create result as the current clean form', async () => {
    const dirtyStates: boolean[] = [];
    const onError = vi.fn();
    const fixture = createStandaloneTestFixture({
      editing: { dialog: { closeOnSuccess: false, enabled: true } },
      hooks: {
        afterSuccess: () => {
          throw new Error('Success callback failed.');
        },
        beforeClose: ({ dirty }) => {
          dirtyStates.push(dirty);
        },
        onError,
      },
      operations: {
        create: () => ({ id: 'record-created', name: 'Canonical name' }),
      },
    });

    await fixture.editor.openCreateDialog();
    replaceName('Submitted name');
    submitForm();
    await vi.waitFor(async () => {
      expect(fixture.editor.getState().status).toBe('open');
      await expect(fixture.editor.getField('name')?.getValue()).resolves.toBe(
        'Canonical name',
      );
    });

    await fixture.editor.closeDialog();
    expect(dirtyStates).toEqual([false]);
    expect(onError).toHaveBeenCalledWith(
      expect.any(AltEditorLiteError),
      expect.objectContaining({ committed: true, phase: 'afterSuccess' }),
    );
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

  it('renders a current Remove snapshot without cloning custom DOM', async () => {
    const customButton = document.createElement('button');
    const handleCustomAction = vi.fn();
    customButton.textContent = 'Review Alpha';
    customButton.addEventListener('click', handleCustomAction);
    let renderedContext:
      Readonly<RemoveConfirmationContext<StandaloneRecord>> | undefined;
    const fixture = createStandaloneTestFixture({
      editing: {
        dialog: {
          enabled: true,
          removeConfirmation: (context) => {
            renderedContext = context;
            return customButton;
          },
        },
      },
      hooks: {
        beforeOpen: (context) => {
          if (context.operation === 'remove') {
            fixture.records.set('record-a', { id: 'record-a', name: 'Latest Alpha' });
          }
        },
      },
    });

    await fixture.editor.openRemoveDialog(['record-a']);
    expect(renderedContext?.count).toBe(1);
    expect(renderedContext?.rows).toEqual([{ id: 'record-a', name: 'Latest Alpha' }]);
    expect(renderedContext?.language.locale).toBe('en');
    expect(
      document.querySelector('.alteditor-lite-remove-confirmation--custom'),
    ).not.toBeNull();
    expect(customButton.isConnected).toBe(true);
    customButton.click();
    expect(handleCustomAction).toHaveBeenCalledOnce();

    await fixture.editor.closeDialog();
    expect(customButton.isConnected).toBe(false);
  });

  it('treats custom Remove strings as plain text', async () => {
    const content = '<img src=x onerror=alert(1)>Remove selected records';
    const fixture = createStandaloneTestFixture({
      editing: {
        dialog: { enabled: true, removeConfirmation: () => content },
      },
    });

    await fixture.editor.openRemoveDialog(['record-a']);
    const confirmation = document.querySelector(
      '.alteditor-lite-remove-confirmation--custom',
    );
    expect(confirmation?.textContent).toBe(content);
    expect(confirmation?.querySelector('img')).toBeNull();
  });

  it('reports a Remove Host application failure after persistence completes', async () => {
    const onError = vi.fn();
    const remove = vi.fn();
    const fixture = createStandaloneTestFixture(
      {
        hooks: { onError },
        operations: { remove },
      },
      {
        applyRemove: () => {
          throw new Error('Host application failed.');
        },
      },
    );

    await fixture.editor.openRemoveDialog(['record-a']);
    confirmRemove();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect(remove).toHaveBeenCalledOnce();
    expect(fixture.records.has('record-a')).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' }),
      expect.objectContaining({ committed: true, phase: 'commit' }),
    );
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

  it('lets beforeClose decide from the current dialog values', async () => {
    const closeEvents = vi.fn();
    const beforeClose = vi.fn(({ dirty }: { readonly dirty: boolean }) =>
      dirty ? false : undefined,
    );
    const fixture = createStandaloneTestFixture({ hooks: { beforeClose } });
    fixture.eventTarget.addEventListener('alteditor-lite:close', closeEvents);

    await fixture.editor.openEditDialog('record-a');
    replaceName('Unsaved');
    await expect(fixture.editor.closeDialog()).resolves.toBeUndefined();
    expect(fixture.editor.getState().status).toBe('open');
    expect(beforeClose).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, operation: 'edit', reason: 'api' }),
    );
    expect(closeEvents).not.toHaveBeenCalled();

    replaceName('Alpha');
    await expect(fixture.editor.closeDialog()).resolves.toBeUndefined();
    expect(fixture.editor.getState().status).toBe('ready');
    expect(beforeClose).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: false, operation: 'edit', reason: 'api' }),
    );
    expect(closeEvents).toHaveBeenCalledOnce();
  });

  it('routes cancel and Escape requests through beforeClose', async () => {
    const beforeClose = vi.fn((context: Readonly<BeforeCloseContext>) => {
      expect(context.mode).toBe('dialog');
      return false;
    });
    const fixture = createStandaloneTestFixture({ hooks: { beforeClose } });

    await fixture.editor.openEditDialog('record-a');
    document
      .querySelector<HTMLButtonElement>('.alteditor-lite-dialog__button--cancel')
      ?.click();
    await vi.waitFor(() => {
      expect(beforeClose).toHaveBeenCalledTimes(1);
    });
    expect(beforeClose.mock.calls[0]?.[0].reason).toBe('cancel');

    document
      .querySelector<HTMLDialogElement>('.alteditor-lite-dialog')
      ?.dispatchEvent(new Event('cancel', { cancelable: true }));
    await vi.waitFor(() => {
      expect(beforeClose).toHaveBeenCalledTimes(2);
    });
    expect(beforeClose.mock.calls[1]?.[0].reason).toBe('escape');
    expect(fixture.editor.getState().status).toBe('open');
  });

  it('shares one pending beforeClose decision', async () => {
    const deferred = createDeferred();
    const beforeClose = vi.fn(() => deferred.promise);
    const fixture = createStandaloneTestFixture({ hooks: { beforeClose } });

    await fixture.editor.openEditDialog('record-a');
    const firstClose = fixture.editor.closeDialog();
    const secondClose = fixture.editor.closeDialog();
    await vi.waitFor(() => {
      expect(beforeClose).toHaveBeenCalledOnce();
    });

    deferred.resolve();
    await expect(Promise.all([firstClose, secondClose])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    expect(fixture.editor.getState().status).toBe('ready');
  });

  it('reports a rejected beforeClose decision and keeps the dialog open', async () => {
    const failure = new Error('Close decision failed.');
    const onError = vi.fn();
    const fixture = createStandaloneTestFixture({
      hooks: {
        beforeClose: () => {
          throw failure;
        },
        onError,
      },
    });

    await fixture.editor.openEditDialog('record-a');
    await expect(fixture.editor.closeDialog()).rejects.toMatchObject({
      cause: failure,
      code: 'UNKNOWN',
    });
    expect(fixture.editor.getState().status).toBe('open');
    expect(onError).toHaveBeenCalledWith(
      expect.any(AltEditorLiteError),
      expect.objectContaining({ committed: false, phase: 'close' }),
    );
  });

  it('reports a Create Host application failure after persistence completes', async () => {
    const onError = vi.fn();
    const create = vi.fn((values: Readonly<{ readonly name?: string }>) => ({
      id: 'record-created',
      name: values.name ?? '',
    }));
    const fixture = createStandaloneTestFixture(
      {
        hooks: { onError },
        operations: { create },
      },
      {
        applyCreate: () => {
          throw new Error('Host application failed.');
        },
      },
    );

    await fixture.editor.openCreateDialog();
    replaceName('Created record');
    submitForm();
    await vi.waitFor(() => {
      expect(onError).toHaveBeenCalledOnce();
    });

    expect(create).toHaveBeenCalledOnce();
    expect(fixture.records.has('record-created')).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' }),
      expect.objectContaining({ committed: true, phase: 'commit' }),
    );
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
