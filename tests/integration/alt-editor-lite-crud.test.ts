import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  AltEditorLiteError,
  ENGLISH_LANGUAGE,
  EditorConfigurationError,
  EditorOperationBusyError,
  EditorSelectionUnavailableError,
  type AltEditorLiteOptions,
  type FieldConfig,
  type OperationContext,
} from '../../src/index.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface CrudValues {
  readonly name: string;
  readonly rank: number;
}

interface DestroyableEditor {
  destroy(): void;
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
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
] as const satisfies readonly FieldConfig<CrudValues>[];

const activeEditors = new Set<DestroyableEditor>();
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
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShowModalDescriptor,
    );
  }

  if (originalCloseDescriptor === undefined) {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  } else {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalCloseDescriptor);
  }
});

afterEach(() => {
  for (const editor of activeEditors) {
    editor.destroy();
  }
  activeEditors.clear();
  destroyTestTables();
});

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value: TValue): void {
      if (resolvePromise === undefined) {
        throw new Error('Deferred promise has no resolver.');
      }
      resolvePromise(value);
    },
  };
}

function createCrudEditor(
  tableId: string,
  editorOptions: Omit<AltEditorLiteOptions<TestRow, CrudValues>, 'fields'> = {},
  tableOptions: object = {},
): {
  readonly api: ReturnType<typeof createTestTable>['api'];
  readonly editor: AltEditorLite<TestRow, CrudValues>;
  readonly tableElement: HTMLTableElement;
} {
  const { api, tableElement } = createTestTable(tableId, tableOptions);
  const editor = new AltEditorLite<TestRow, CrudValues>(api, {
    fields,
    ...editorOptions,
  });
  activeEditors.add(editor);
  return { api, editor, tableElement };
}

function submitForm(): void {
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

function confirmRemove(): void {
  const confirmButton = document.querySelector<HTMLButtonElement>(
    '.dt-alteditor-lite-dialog__button--destructive',
  );
  if (confirmButton === null) {
    throw new Error('Expected an open Remove confirmation.');
  }
  confirmButton.click();
}

describe('AltEditorLite form opening', () => {
  it('resolves Edit dependencies from populated row values before opening', async () => {
    const { editor } = createCrudEditor('edit-dependencies', {
      dependencies: {
        name: (name, context) => {
          expect(context.values).toMatchObject({ name: 'Alpha', rank: 1 });
          return {
            rank: {
              readOnly: name === 'Alpha',
              required: false,
            },
          };
        },
      },
    });

    await editor.openEditDialog('#row-a');
    expect(editor.getField('rank')?.isReadOnly()).toBe(true);
    expect(editor.getField('rank')?.isRequired()).toBe(false);
  });

  it('uses a custom Edit layout with populated editor-owned fields', async () => {
    const template = document.createElement('template');
    template.innerHTML = `
      <section class="custom-edit-layout">
        <div data-alteditor-lite-field="rank"></div>
        <div data-alteditor-lite-field="name"></div>
      </section>
    `;
    const { api, editor } = createCrudEditor('custom-edit-layout', {
      editing: { dialog: { template } },
    });

    await editor.openEditDialog('#row-a');
    const customLayout = document.querySelector('.custom-edit-layout');
    expect(
      customLayout?.querySelector<HTMLInputElement>(
        '[data-alteditor-lite-field="name"] input',
      )?.value,
    ).toBe('Alpha');
    expect(
      customLayout?.querySelector<HTMLInputElement>(
        '[data-alteditor-lite-field="rank"] input',
      )?.value,
    ).toBe('1');

    editor.getField('name')?.setValue('Custom Alpha');
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.row('#row-a').data()).toMatchObject({
      name: 'Custom Alpha',
      rank: 1,
    });
  });

  it('treats closing during beforeOpen as a completed cancellation', async () => {
    const beforeOpen = createDeferred<boolean>();
    const onError = vi.fn();
    const { editor } = createCrudEditor('cancel-before-open', {
      hooks: {
        beforeOpen: () => beforeOpen.promise,
        onError,
      },
    });

    const opening = editor.openEditDialog('#row-a');
    await vi.waitFor(() => {
      expect(editor.getState()).toEqual({ status: 'ready' });
    });
    await editor.closeDialog();
    beforeOpen.resolve(true);

    await expect(opening).resolves.toBeUndefined();
    expect(editor.getState()).toEqual({ status: 'ready' });
    expect(onError).not.toHaveBeenCalled();

    await editor.openEditDialog('#row-a');
    expect(editor.getState()).toEqual({ action: 'edit', status: 'open' });
    await editor.closeDialog();
  });

  it('recovers and publishes an error when source values cannot populate a field', async () => {
    const invalidRow = {
      id: 'row-null',
      name: null,
      rank: 1,
    } as unknown as TestRow;
    const { editor, tableElement } = createCrudEditor(
      'invalid-edit-source',
      {
        clientSide: {
          createRow: (values) => ({
            id: 'created-after-error',
            name: values.name ?? '',
            rank: values.rank ?? 0,
          }),
          updateRow: (original, values) => ({
            ...original,
            ...values,
          }),
        },
      },
      { data: [invalidRow] },
    );
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await expect(editor.openEditDialog('#row-null')).rejects.toThrow(
      EditorConfigurationError,
    );

    expect(editor.getState()).toEqual({ status: 'ready' });
    expect(document.querySelector('.dt-alteditor-lite-form')).toBeNull();
    expect(errorListener).toHaveBeenCalledOnce();
    const errorEvent = errorListener.mock.calls[0]?.[0] as
      CustomEvent<unknown> | undefined;
    expect(errorEvent?.detail).toMatchObject({
      editor,
      error: {
        code: 'CONFIGURATION',
        message: 'Field "name" requires a string value.',
      },
      operation: 'edit',
      type: 'error',
    });

    await expect(editor.openCreateDialog()).resolves.toBeUndefined();
    expect(editor.getState()).toEqual({ action: 'create', status: 'open' });
    await editor.closeDialog();
    expect(editor.getState()).toEqual({ status: 'ready' });
  });
});

describe('AltEditorLite asynchronous Create', () => {
  it('waits for persistence before adding and draws before success', async () => {
    const deferredRow = createDeferred<TestRow>();
    let operationContext: OperationContext<TestRow> | undefined;
    const createOperation = vi.fn(
      (_values: Readonly<Partial<CrudValues>>, context: OperationContext<TestRow>) => {
        operationContext = context;
        return deferredRow.promise;
      },
    );
    const { api, editor, tableElement } = createCrudEditor('async-create', {
      operations: { create: createOperation },
    });
    const successListener = vi.fn(() => {
      expect(api.row('#created-async').any()).toBe(true);
    });
    tableElement.addEventListener('alteditor-lite:success', successListener);

    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Async');
    editor.getField('rank')?.setValue(7);
    submitForm();

    await vi.waitFor(() => {
      expect(createOperation).toHaveBeenCalledOnce();
    });
    expect(api.rows().count()).toBe(5);
    expect(operationContext?.operation).toBe('create');
    expect(operationContext?.table).toBe(api);
    expect(operationContext?.signal.aborted).toBe(false);

    deferredRow.resolve({ id: 'created-async', name: 'Async', rank: 7 });
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.rows().count()).toBe(6);
    expect(successListener).toHaveBeenCalledOnce();
  });

  it('keeps rejection non-mutating and retries with a fresh signal', async () => {
    const operationSignals: AbortSignal[] = [];
    let attemptCount = 0;
    const { api, editor } = createCrudEditor('async-create-retry', {
      operations: {
        create: (_values, context) => {
          operationSignals.push(context.signal);
          attemptCount += 1;
          if (attemptCount === 1) {
            throw new AltEditorLiteError({
              code: 'TEMPORARY',
              message: 'Try again.',
              retryable: true,
            });
          }
          return { id: 'retry-created', name: 'Retry', rank: 8 };
        },
      },
    });

    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Retry');
    editor.getField('rank')?.setValue(8);
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(api.rows().count()).toBe(5);
    expect(document.querySelector('dialog')?.open).toBe(true);

    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(operationSignals).toHaveLength(2);
    expect(operationSignals[0]).not.toBe(operationSignals[1]);
    expect(api.row('#retry-created').any()).toBe(true);
  });

  it('aborts and ignores a pending Create when destroyed', async () => {
    const deferredRow = createDeferred<TestRow>();
    let operationSignal: AbortSignal | undefined;
    const { api, editor, tableElement } = createCrudEditor('destroy-create', {
      operations: {
        create: (_values, context) => {
          operationSignal = context.signal;
          return deferredRow.promise;
        },
      },
    });
    const successListener = vi.fn();
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:success', successListener);
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Destroyed');
    editor.getField('rank')?.setValue(10);
    submitForm();
    await vi.waitFor(() => {
      expect(operationSignal).toBeDefined();
    });

    editor.destroy();
    expect(operationSignal?.aborted).toBe(true);
    deferredRow.resolve({ id: 'destroyed-result', name: 'Destroyed', rank: 10 });
    await Promise.resolve();
    await Promise.resolve();

    expect(api.row('#destroyed-result').any()).toBe(false);
    expect(successListener).not.toHaveBeenCalled();
    expect(errorListener).not.toHaveBeenCalled();
  });
});

describe('AltEditorLite Edit snapshots', () => {
  it('rejects duplicate loaded values while excluding the current Edit row', async () => {
    const uniqueFields = [
      { ...fields[0], unique: true },
      fields[1],
    ] satisfies readonly FieldConfig<CrudValues>[];
    const { api, tableElement } = createTestTable('local-unique');
    const createOperation = vi.fn((values: Readonly<Partial<CrudValues>>) => ({
      id: 'unique-created',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const editor = new AltEditorLite<TestRow, CrudValues>(api, {
      fields: uniqueFields,
      operations: { create: createOperation },
    });
    activeEditors.add(editor);

    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Alpha');
    editor.getField('rank')?.setValue(10);
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(createOperation).not.toHaveBeenCalled();
    expect(
      tableElement.ownerDocument.querySelector('.dt-alteditor-lite-field__error')
        ?.textContent,
    ).toBe(ENGLISH_LANGUAGE.validation.unique);
    await editor.closeDialog();

    await editor.openEditDialog('#row-a');
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.row('#row-a').data().name).toBe('Alpha');

    await editor.openEditDialog('#row-b');
    editor.getField('name')?.setValue('Alpha');
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(api.row('#row-b').data().name).toBe('Beta');
  });

  it('keeps Dialog Edit non-mutating when cross-field validation fails', async () => {
    const update = vi.fn(
      (values: Readonly<Partial<CrudValues>>, original: Readonly<TestRow>): TestRow => ({
        ...original,
        name: values.name ?? original.name,
        rank: values.rank ?? original.rank,
      }),
    );
    const beforeSubmit = vi.fn(() => true);
    const { api, editor } = createCrudEditor('edit-cross-field-validation', {
      hooks: { beforeSubmit },
      operations: { update },
      validateForm: (values, context) => {
        expect(context.operation).toBe('edit');
        expect(context.mode).toBe('dialog');
        return (values.rank ?? 0) < (values.name?.length ?? 0)
          ? {
              fieldErrors: {
                rank: 'Rank must be at least the length of the name.',
              },
              valid: false,
            }
          : { valid: true };
      },
    });
    const original = { ...api.row('#row-a').data() };
    await editor.openEditDialog('#row-a');
    editor.getField('name')?.setValue('Extended Alpha');
    editor.getField('rank')?.setValue(2);

    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });

    expect(update).not.toHaveBeenCalled();
    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(api.row('#row-a').data()).toEqual(original);
    expect(
      editor.getField('rank')?.element.querySelector('.dt-alteditor-lite-field__error')
        ?.textContent,
    ).toContain('Rank must be at least the length of the name.');
  });

  it('updates the explicit snapshot after sort, search, paging, and redraw', async () => {
    const eventOrder: string[] = [];
    let callbackOriginal: Readonly<TestRow> | undefined;
    const { api, editor, tableElement } = createCrudEditor('edit-operation', {
      operations: {
        update: (values, original, context) => {
          callbackOriginal = original;
          expect(context.operation).toBe('edit');
          return {
            ...original,
            name: values.name ?? original.name,
            rank: values.rank ?? original.rank,
          };
        },
      },
    });
    for (const eventName of [
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]) {
      tableElement.addEventListener(eventName, (event) => {
        eventOrder.push(event.type);
      });
    }
    const liveOriginal = api.row('#row-a').data();

    await editor.openEditDialog('#row-a');
    await expect(editor.getField('name')?.getValue()).resolves.toBe('Alpha');
    editor.getField('name')?.setValue('Edited Alpha');
    api.order([[1, 'desc']]).draw();
    api.search('Alpha').draw();
    api.search('').draw();
    api.page(1).draw('page');
    submitForm();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.row('#row-a').data().name).toBe('Edited Alpha');
    expect(callbackOriginal).toEqual(liveOriginal);
    expect(callbackOriginal).not.toBe(liveOriginal);
    expect(Object.isFrozen(callbackOriginal)).toBe(true);
    expect(eventOrder).toEqual([
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]);
  });

  it('supports client mapping and safe declared-field merge', async () => {
    const clientEditor = createCrudEditor('client-update', {
      clientSide: {
        updateRow: (original, values) => ({
          ...original,
          name: `Client ${values.name ?? original.name}`,
        }),
      },
    });
    await clientEditor.editor.openEditDialog('#row-b');
    clientEditor.editor.getField('name')?.setValue('Beta');
    submitForm();
    await vi.waitFor(() => {
      expect(clientEditor.editor.getState().status).toBe('ready');
    });
    expect(clientEditor.api.row('#row-b').data().name).toBe('Client Beta');

    clientEditor.editor.destroy();
    activeEditors.delete(clientEditor.editor);
    clientEditor.api.destroy();

    const defaultEditor = createCrudEditor('default-update');
    const liveOriginal = defaultEditor.api.row('#row-c').data();
    await defaultEditor.editor.openEditDialog('#row-c');
    defaultEditor.editor.getField('name')?.setValue('Merged Gamma');
    submitForm();
    await vi.waitFor(() => {
      expect(defaultEditor.editor.getState().status).toBe('ready');
    });
    expect(defaultEditor.api.row('#row-c').data()).toEqual({
      id: 'row-c',
      name: 'Merged Gamma',
      rank: 3,
    });
    expect(liveOriginal.name).toBe('Gamma');
  });

  it('clears an optional field through the built-in declared-field merge', async () => {
    interface ClearValues {
      readonly rank?: number;
    }

    const { api } = createTestTable('default-clear', {
      columns: [{ data: 'name' }, { data: 'rank', defaultContent: '' }],
    });
    const editor = new AltEditorLite<TestRow, ClearValues>(api, {
      fields: [{ label: 'Rank', name: 'rank', type: 'number' }],
    });
    activeEditors.add(editor);

    await editor.openEditDialog('#row-a');
    editor.getField('rank')?.setValue(undefined);
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });

    expect(api.row('#row-a').data()).toHaveProperty('rank', undefined);
  });

  it('rejects an externally removed or replaced rowId target', async () => {
    const updateOperation = vi.fn(
      (_values: Readonly<Partial<CrudValues>>, original: Readonly<TestRow>) => original,
    );
    const { api, editor, tableElement } = createCrudEditor('stale-edit', {
      operations: { update: updateOperation },
    });
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.openEditDialog('#row-a');
    editor.getField('name')?.setValue('Must not apply');
    api.row('#row-a').remove();
    api.rows.add([{ id: 'row-a', name: 'Replacement', rank: 99 }]).draw(false);
    submitForm();

    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalledOnce();
    });
    expect(updateOperation).not.toHaveBeenCalled();
    expect(api.row('#row-a').data().name).toBe('Replacement');
    expect(editor.getState()).toMatchObject({
      status: 'open',
      submissionError: { code: 'TARGET_UNAVAILABLE' },
    });
  });

  it('uses the guarded row-index fallback when no rowId exists', async () => {
    const { api, editor } = createCrudEditor(
      'index-fallback',
      {},
      { rowId: 'missingIdentity' },
    );
    const sourceRow = api.row(0).data();
    expect(api.row(0).id()).toBe('undefined');

    await editor.openEditDialog(0);
    editor.getField('name')?.setValue('Index target');
    api.order([[1, 'desc']]).draw();
    expect(api.row(0).index()).toBe(0);
    expect(api.row(0).data()).toBe(sourceRow);
    submitForm();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.row(0).data().name).toBe('Index target');
  });

  it('aborts a pending Update when the dialog closes and ignores its result', async () => {
    const deferredRow = createDeferred<TestRow>();
    let operationSignal: AbortSignal | undefined;
    const { api, editor, tableElement } = createCrudEditor('abort-edit', {
      operations: {
        update: (_values, _original, context) => {
          operationSignal = context.signal;
          return deferredRow.promise;
        },
      },
    });
    const successListener = vi.fn();
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:success', successListener);
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.openEditDialog('#row-b');
    editor.getField('name')?.setValue('Late result');
    submitForm();
    await vi.waitFor(() => {
      expect(operationSignal).toBeDefined();
    });

    await editor.closeDialog();
    expect(operationSignal?.aborted).toBe(true);
    deferredRow.resolve({ id: 'row-b', name: 'Late result', rank: 2 });
    await Promise.resolve();
    await Promise.resolve();

    expect(api.row('#row-b').data().name).toBe('Beta');
    expect(successListener).not.toHaveBeenCalled();
    expect(errorListener).not.toHaveBeenCalled();
    expect(editor.getState().status).toBe('ready');
  });
});

describe('AltEditorLite Remove snapshots', () => {
  it('confirms without a form and removes only after async persistence', async () => {
    const deferredRemoval = createDeferred<undefined>();
    const removeOperation = vi.fn(
      (_rows: readonly Readonly<TestRow>[], context: OperationContext<TestRow>) => {
        expect(context.operation).toBe('remove');
        return deferredRemoval.promise;
      },
    );
    const { api, editor, tableElement } = createCrudEditor('async-remove', {
      operations: { remove: removeOperation },
    });
    const eventOrder: string[] = [];
    for (const eventName of [
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]) {
      tableElement.addEventListener(eventName, (event) => {
        if (event.type === 'alteditor-lite:success') {
          expect(api.rows().count()).toBe(3);
        }
        eventOrder.push(event.type);
      });
    }

    await editor.openRemoveDialog(['#row-a', '#row-b']);
    expect(document.querySelector('.dt-alteditor-lite-form')).toBeNull();
    expect(
      document.querySelector('.dt-alteditor-lite-remove-confirmation')?.textContent,
    ).toContain('Selected rows: 2.');
    confirmRemove();
    await vi.waitFor(() => {
      expect(removeOperation).toHaveBeenCalledOnce();
    });
    expect(api.rows().count()).toBe(5);

    deferredRemoval.resolve(undefined);
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.rows().count()).toBe(3);
    expect(api.row('#row-a').any()).toBe(false);
    expect(api.row('#row-b').any()).toBe(false);
    expect(eventOrder).toEqual([
      'alteditor-lite:open',
      'alteditor-lite:submit',
      'alteditor-lite:success',
      'alteditor-lite:close',
    ]);
  });

  it('performs default client-side Remove and rejects an all-or-nothing stale set', async () => {
    const defaultEditor = createCrudEditor('default-remove');
    await defaultEditor.editor.openRemoveDialog('#row-e');
    confirmRemove();
    await vi.waitFor(() => {
      expect(defaultEditor.editor.getState().status).toBe('ready');
    });
    expect(defaultEditor.api.row('#row-e').any()).toBe(false);

    defaultEditor.editor.destroy();
    activeEditors.delete(defaultEditor.editor);
    defaultEditor.api.destroy();

    const removeOperation = vi.fn();
    const staleEditor = createCrudEditor('stale-remove', {
      operations: { remove: removeOperation },
    });
    await staleEditor.editor.openRemoveDialog(['#row-a', '#row-b']);
    staleEditor.api.row('#row-a').remove().draw(false);
    confirmRemove();
    await vi.waitFor(() => {
      expect(staleEditor.editor.getState().status).toBe('open');
    });

    expect(removeOperation).not.toHaveBeenCalled();
    expect(staleEditor.api.row('#row-b').any()).toBe(true);
    expect(staleEditor.api.rows().count()).toBe(4);
  });

  it('keeps a failed Remove snapshot intact for a fresh-signal retry', async () => {
    const operationSignals: AbortSignal[] = [];
    let attemptCount = 0;
    const { api, editor } = createCrudEditor('retry-remove', {
      operations: {
        remove: (_rows, context) => {
          operationSignals.push(context.signal);
          attemptCount += 1;
          if (attemptCount === 1) {
            throw new AltEditorLiteError({
              code: 'TEMPORARY_REMOVE',
              message: 'Removal can be retried.',
              retryable: true,
            });
          }
        },
      },
    });

    await editor.openRemoveDialog('#row-d');
    confirmRemove();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(api.row('#row-d').any()).toBe(true);

    confirmRemove();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(operationSignals).toHaveLength(2);
    expect(operationSignals[0]).not.toBe(operationSignals[1]);
    expect(api.row('#row-d').any()).toBe(false);
  });

  it('reports an unrelated Remove AbortError without mutating rows', async () => {
    let operationSignal: AbortSignal | undefined;
    const { api, editor, tableElement } = createCrudEditor('remove-abort-error', {
      operations: {
        remove: (_rows, context) => {
          operationSignal = context.signal;
          throw new DOMException('Consumer cancellation.', 'AbortError');
        },
      },
    });
    let removeError: AltEditorLiteError | undefined;
    tableElement.addEventListener('alteditor-lite:error', (event) => {
      removeError = (event as CustomEvent<{ readonly error: AltEditorLiteError }>).detail
        .error;
    });

    await editor.openRemoveDialog('#row-d');
    confirmRemove();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });

    expect(api.row('#row-d').any()).toBe(true);
    expect(operationSignal?.aborted).toBe(false);
    expect(removeError).toMatchObject({
      code: 'UNKNOWN',
      message: ENGLISH_LANGUAGE.errors.generic,
      retryable: false,
    });
  });
});

describe('AltEditorLite Refresh and optional selection boundary', () => {
  it('publishes non-bubbling non-Ajax Refresh events in exact order', async () => {
    const { editor, tableElement } = createCrudEditor('local-refresh');
    const eventOrder: string[] = [];
    const parentEvents: string[] = [];

    tableElement.addEventListener('alteditor-lite:refresh', (event) => {
      if (event instanceof CustomEvent) {
        const refreshEvent = event as CustomEvent<{ readonly phase: string }>;
        eventOrder.push(`refresh:${refreshEvent.detail.phase}`);
      }
    });
    tableElement.addEventListener('alteditor-lite:success', () => {
      eventOrder.push('success');
    });
    tableElement.parentElement?.addEventListener('alteditor-lite:refresh', (event) => {
      parentEvents.push(event.type);
    });

    await editor.refreshTable();

    expect(eventOrder).toEqual(['refresh:start', 'success', 'refresh:complete']);
    expect(parentEvents).toEqual([]);
    expect(editor.getState().status).toBe('ready');
  });

  it('uses public Ajax reload and rejects Refresh while a dialog is active', async () => {
    let ajaxRequestCount = 0;
    let completeRefreshRequest: (() => void) | undefined;
    const ajaxRows = [{ id: 'ajax-a', name: 'Ajax Alpha', rank: 1 }] satisfies TestRow[];
    const ajax = (
      _request: unknown,
      callback: (response: { readonly data: readonly TestRow[] }) => void,
    ): void => {
      ajaxRequestCount += 1;
      if (ajaxRequestCount === 1) {
        callback({ data: ajaxRows });
      } else {
        completeRefreshRequest = () => {
          callback({ data: ajaxRows });
        };
      }
    };
    const { editor } = createCrudEditor(
      'ajax-refresh',
      {
        operations: {
          create: (values) => ({
            id: 'unused',
            name: values.name ?? '',
            rank: values.rank ?? 0,
          }),
        },
      },
      { ajax, data: [] },
    );
    await vi.waitFor(() => {
      expect(ajaxRequestCount).toBe(1);
    });

    const refreshRequest = editor.refreshTable();
    await vi.waitFor(() => {
      expect(ajaxRequestCount).toBe(2);
    });
    expect(editor.getState().status).toBe('refreshing');
    expect(completeRefreshRequest).toBeTypeOf('function');

    completeRefreshRequest?.();
    await refreshRequest;
    expect(editor.getState().status).toBe('ready');

    await editor.openCreateDialog();
    await expect(editor.refreshTable()).rejects.toThrow(EditorOperationBusyError);
    await editor.closeDialog();
  });

  it('normalizes a Refresh failure and completes its event sequence once', async () => {
    const ajax = (
      _request: unknown,
      callback: (response: { readonly data: readonly TestRow[] }) => void,
    ): void => {
      callback({ data: [] });
    };
    const { api, editor, tableElement } = createCrudEditor(
      'failed-ajax-refresh',
      {},
      { ajax, data: [] },
    );
    const eventOrder: string[] = [];
    const parentEvents: string[] = [];
    let refreshError: AltEditorLiteError | undefined;

    tableElement.addEventListener('alteditor-lite:refresh', (event) => {
      if (event instanceof CustomEvent) {
        const refreshEvent = event as CustomEvent<{ readonly phase: string }>;
        eventOrder.push(`refresh:${refreshEvent.detail.phase}`);
      }
    });
    tableElement.addEventListener('alteditor-lite:error', (event) => {
      const errorEvent = event as CustomEvent<{
        readonly error: AltEditorLiteError;
      }>;
      refreshError = errorEvent.detail.error;
      eventOrder.push('error');
    });
    tableElement.parentElement?.addEventListener('alteditor-lite:error', (event) => {
      parentEvents.push(event.type);
    });
    vi.spyOn(api.ajax, 'reload').mockImplementationOnce(() => {
      throw new TypeError('private refresh detail');
    });

    await editor.refreshTable();

    expect(eventOrder).toEqual(['refresh:start', 'error', 'refresh:complete']);
    expect(parentEvents).toEqual([]);
    expect(refreshError).toMatchObject({
      code: 'UNKNOWN',
      message: ENGLISH_LANGUAGE.errors.generic,
      retryable: false,
    });
    expect(refreshError?.message).not.toContain('private refresh detail');
    expect(editor.getState().status).toBe('ready');
  });

  it('reports a Refresh AbortError when the operation signal remains active', async () => {
    const { editor, tableElement } = createCrudEditor('cancelled-refresh', {
      operations: {
        refresh: () => {
          throw new DOMException('Cancelled.', 'AbortError');
        },
      },
    });
    const phases: string[] = [];
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:refresh', (event) => {
      phases.push((event as CustomEvent<{ readonly phase: string }>).detail.phase);
    });
    tableElement.addEventListener('alteditor-lite:error', errorListener);

    await editor.refreshTable();

    expect(phases).toEqual(['start', 'complete']);
    expect(errorListener).toHaveBeenCalledOnce();
    expect(
      (
        errorListener.mock.calls[0]?.[0] as CustomEvent<{
          readonly error: AltEditorLiteError;
        }>
      ).detail.error,
    ).toMatchObject({
      code: 'UNKNOWN',
      message: ENGLISH_LANGUAGE.errors.generic,
      retryable: false,
    });
    expect(editor.getState()).toEqual({ status: 'ready' });
  });

  it('requires Select only when no explicit selector is supplied', async () => {
    const unavailableMessage = 'Selection support is unavailable.';
    const { editor } = createCrudEditor('no-select', {
      language: { buttons: { selectUnavailable: unavailableMessage } },
    });

    const editRejection = editor.openEditDialog();
    await expect(editRejection).rejects.toThrow(EditorSelectionUnavailableError);
    await expect(editRejection).rejects.toMatchObject({ message: unavailableMessage });

    const removeRejection = editor.openRemoveDialog();
    await expect(removeRejection).rejects.toThrow(EditorSelectionUnavailableError);
    await expect(removeRejection).rejects.toMatchObject({
      message: unavailableMessage,
    });
    expect(editor.getState().status).toBe('ready');

    await editor.openEditDialog('#row-c');
    await editor.closeDialog();
    await editor.openRemoveDialog('#row-d');
    await editor.closeDialog();
  });
});
