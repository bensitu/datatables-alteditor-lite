import DataTable from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  AltEditorLiteError,
  EditorAlreadyInitializedError,
  EditorConfigurationError,
  EditorDestroyedError,
  type FieldConfig,
} from '../../src/index.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface CreateValues {
  readonly name: string;
  readonly rank: number;
}

const fields = [
  {
    label: 'Name',
    name: 'name',
    required: true,
    type: 'text',
  },
  {
    label: 'Rank',
    name: 'rank',
    required: true,
    type: 'number',
  },
] satisfies readonly FieldConfig<CreateValues>[];

const activeEditors = new Set<AltEditorLite<TestRow, CreateValues>>();
let originalShowModalDescriptor: PropertyDescriptor | undefined;
let originalCloseDescriptor: PropertyDescriptor | undefined;

beforeAll(() => {
  originalShowModalDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'showModal',
  );
  originalCloseDescriptor = Object.getOwnPropertyDescriptor(
    HTMLDialogElement.prototype,
    'close',
  );

  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement): void {
      this.open = false;
    },
  });
});

afterAll(() => {
  if (originalShowModalDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      ...originalShowModalDescriptor,
    });
  }

  if (originalCloseDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      ...originalCloseDescriptor,
    });
  }
});

afterEach(() => {
  for (const editor of activeEditors) {
    editor.destroy();
  }
  activeEditors.clear();
  destroyTestTables();
});

function createEditor(
  tableId: string,
  createRow: (values: Readonly<Partial<CreateValues>>) => TestRow,
  closeOnSuccess = true,
): {
  readonly api: ReturnType<typeof createTestTable>['api'];
  readonly editor: AltEditorLite<TestRow, CreateValues>;
  readonly tableElement: HTMLTableElement;
} {
  const { api, tableElement } = createTestTable(tableId);
  const editor = new AltEditorLite<TestRow, CreateValues>(api, {
    clientSide: { createRow },
    closeOnSuccess,
    fields,
  });
  activeEditors.add(editor);
  return { api, editor, tableElement };
}

function submitOpenDialog(): void {
  const formElement = document.querySelector<HTMLFormElement>('.dt-alteditor-lite-form');
  if (formElement === null) {
    throw new Error('Expected an open editor form.');
  }

  formElement.dispatchEvent(
    new SubmitEvent('submit', {
      bubbles: true,
      cancelable: true,
    }),
  );
}

describe('AltEditorLite synchronous Create', () => {
  it('initializes manually and exposes the retrieval-only DataTables getter', () => {
    const { api, editor } = createEditor('manual', (values) => ({
      id: 'new-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));

    expect(api.altEditorLite<CreateValues>()).toBe(editor);
    expect(new DataTable<TestRow>('#manual').altEditorLite<CreateValues>()).toBe(editor);
  });

  it('rejects duplicate initialization for the same public table node', () => {
    const { api } = createEditor('duplicate', (values) => ({
      id: 'new-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));

    expect(
      () =>
        new AltEditorLite<TestRow, CreateValues>(api, {
          clientSide: {
            createRow: (values) => ({
              id: 'duplicate-row',
              name: values.name ?? '',
              rank: values.rank ?? 0,
            }),
          },
          fields,
        }),
    ).toThrow(EditorAlreadyInitializedError);
  });

  it('publishes ordered non-bubbling events and mutates after row construction', async () => {
    const { api, editor, tableElement } = createEditor('create-success', (values) => ({
      id: 'created-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const eventOrder: string[] = [];
    const eventDetails: unknown[] = [];
    const parentEvents: string[] = [];
    const containerElement = tableElement.parentElement;

    for (const eventName of [
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]) {
      tableElement.addEventListener(eventName, (event) => {
        eventOrder.push(event.type);
        expect(event.bubbles).toBe(false);
        expect(event.cancelable).toBe(false);
        if (event instanceof CustomEvent) {
          const customEvent = event as CustomEvent<unknown>;
          eventDetails.push(customEvent.detail);
        }
      });
      containerElement?.addEventListener(eventName, (event) => {
        parentEvents.push(event.type);
      });
    }

    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Created');
    editor.getField<number>('rank')?.setValue(9);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(editor.getState()).toEqual({ status: 'ready' });
    });
    expect(api.rows().count()).toBe(6);
    expect(api.row('#created-row').data()).toMatchObject({
      name: 'Created',
      rank: 9,
    });
    expect(eventOrder).toEqual([
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]);
    expect(eventDetails).toMatchObject([
      { editor, operation: 'create', type: 'open' },
      {
        editor,
        operation: 'create',
        type: 'submit',
        values: { name: 'Created', rank: 9 },
      },
      {
        editor,
        operation: 'create',
        row: { id: 'created-row', name: 'Created', rank: 9 },
        type: 'success',
        values: { name: 'Created', rank: 9 },
      },
      {
        editor,
        operation: 'create',
        reason: 'success',
        type: 'close',
      },
    ]);
    expect(parentEvents).toEqual([]);
  });

  it('does not mutate when validation fails', async () => {
    const createRow = vi.fn((values: Readonly<Partial<CreateValues>>) => ({
      id: 'invalid-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const { api, editor } = createEditor('validation-failure', createRow);
    await editor.openCreateDialog();
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(createRow).not.toHaveBeenCalled();
    expect(api.rows().count()).toBe(5);
    expect(document.querySelector('[aria-invalid="true"]')).not.toBeNull();
  });

  it('keeps the dialog open and retryable when row construction throws', async () => {
    let shouldFail = true;
    const { api, editor, tableElement } = createEditor('callback-failure', (values) => {
      if (shouldFail) {
        throw new AltEditorLiteError({
          code: 'DOMAIN_MAPPING',
          message: 'Domain mapping failed.',
          retryable: true,
        });
      }
      return {
        id: 'retried-row',
        name: values.name ?? '',
        rank: values.rank ?? 0,
      };
    });
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Retry');
    editor.getField<number>('rank')?.setValue(4);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalledOnce();
    });
    expect(api.rows().count()).toBe(5);
    expect(editor.getState().status).toBe('open');
    expect(document.querySelector('dialog')?.open).toBe(true);

    shouldFail = false;
    submitOpenDialog();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.rows().count()).toBe(6);
  });

  it('rejects a Promise-returning clientSide callback without mutation', async () => {
    const asynchronousCreateRow = ((
      values: Readonly<Partial<CreateValues>>,
    ): Promise<TestRow> =>
      Promise.resolve({
        id: 'async-row',
        name: values.name ?? '',
        rank: values.rank ?? 0,
      })) as unknown as (values: Readonly<Partial<CreateValues>>) => TestRow;
    const { api, editor } = createEditor('async-callback', asynchronousCreateRow);
    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Async');
    editor.getField<number>('rank')?.setValue(5);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
      expect(
        document.querySelector('.dt-alteditor-lite-dialog__errors')?.textContent,
      ).toContain('must return synchronously');
    });
    expect(api.rows().count()).toBe(5);
  });

  it('rejects an array returned as a row without mutating DataTables', async () => {
    const arrayCreateRow = (() => []) as unknown as (
      values: Readonly<Partial<CreateValues>>,
    ) => TestRow;
    const { api, editor, tableElement } = createEditor(
      'array-row-callback',
      arrayCreateRow,
    );
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Invalid');
    editor.getField<number>('rank')?.setValue(6);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalledOnce();
    });
    expect(editor.getState()).toMatchObject({ action: 'create', status: 'open' });
    expect(api.rows().count()).toBe(5);
    expect(
      document.querySelector('.dt-alteditor-lite-dialog__errors')?.textContent,
    ).toContain('must return a complete row object');
  });

  it('honors closeOnSuccess false', async () => {
    const { api, editor } = createEditor(
      'stay-open',
      (values) => ({
        id: 'stay-open-row',
        name: values.name ?? '',
        rank: values.rank ?? 0,
      }),
      false,
    );
    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Stay');
    editor.getField<number>('rank')?.setValue(2);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(api.rows().count()).toBe(6);
    });
    expect(editor.getState().status).toBe('open');
    expect(document.querySelector('dialog')?.open).toBe(true);
    await editor.closeDialog();
    expect(editor.getState().status).toBe('ready');
  });

  it('isolates multiple tables and cleans up destroy exactly once', async () => {
    const first = createEditor('first-table', (values) => ({
      id: 'first-new',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const second = createEditor('second-table', (values) => ({
      id: 'second-new',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const firstDestroy = vi.fn();
    const secondDestroy = vi.fn();
    first.tableElement.addEventListener('alteditor-lite:destroy', firstDestroy);
    second.tableElement.addEventListener('alteditor-lite:destroy', secondDestroy);

    first.editor.destroy();
    first.editor.destroy();
    expect(firstDestroy).toHaveBeenCalledOnce();
    expect(secondDestroy).not.toHaveBeenCalled();
    expect(first.api.altEditorLite()).toBeNull();
    expect(second.api.altEditorLite<CreateValues>()).toBe(second.editor);
    expect(() => first.editor.getState()).toThrow(EditorDestroyedError);
    await expect(first.editor.openCreateDialog()).rejects.toThrow(EditorDestroyedError);
  });

  it('removes an open form before destroy observers run', async () => {
    const { api, editor, tableElement } = createEditor('destroy-open', (values) => ({
      id: 'destroyed-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const destroyListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:destroy', destroyListener);
    await editor.openCreateDialog();
    const formElement = document.querySelector<HTMLFormElement>(
      '.dt-alteditor-lite-form',
    );

    editor.destroy();
    formElement?.dispatchEvent(
      new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(destroyListener).toHaveBeenCalledOnce();
    expect(document.querySelector('.dt-alteditor-lite-dialog')).toBeNull();
    expect(api.rows().count()).toBe(5);
    expect(api.altEditorLite()).toBeNull();
  });

  it('does not construct or mutate a row when a submit observer destroys the editor', async () => {
    const createRow = vi.fn((values: Readonly<Partial<CreateValues>>): TestRow => ({
      id: 'observer-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const { api, editor, tableElement } = createEditor('destroy-on-submit', createRow);
    await editor.openCreateDialog();
    editor.getField<string>('name')?.setValue('Observer');
    editor.getField<number>('rank')?.setValue(7);
    tableElement.addEventListener(
      'alteditor-lite:submit',
      () => {
        editor.destroy();
      },
      { once: true },
    );

    submitOpenDialog();
    await vi.waitFor(() => {
      expect(api.altEditorLite()).toBeNull();
    });

    expect(createRow).not.toHaveBeenCalled();
    expect(api.rows().count()).toBe(5);
  });

  it('initializes without Create capability but rejects opening it', async () => {
    const { api } = createTestTable('unavailable');
    const editor = new AltEditorLite<TestRow, CreateValues>(api, {
      fields,
    });
    activeEditors.add(editor);

    await expect(editor.openCreateDialog()).rejects.toThrow(EditorConfigurationError);
    expect(api.rows().count()).toBe(5);
  });
});
