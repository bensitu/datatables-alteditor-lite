import DataTable from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  AltEditorLiteError,
  EditorAlreadyInitializedError,
  EditorConfigurationError,
  EditorDestroyedError,
  type FieldConfig,
} from '../../src/datatables.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface CreateValues {
  readonly name: string;
  readonly rank: number;
}

interface LocationValues {
  readonly country: string;
  readonly name: string;
  readonly rank: number;
  readonly region: string | undefined;
}

interface DestroyableEditor {
  destroy(): void;
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
    editing: { dialog: { closeOnSuccess } },
    fields,
  });
  activeEditors.add(editor);
  return { api, editor, tableElement };
}

function submitOpenDialog(): void {
  const formElement = document.querySelector<HTMLFormElement>('.alteditor-lite-form');
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
    editor.getField('name')?.setValue('Created');
    editor.getField('rank')?.setValue(9);
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

  it('keeps Create open when cross-field validation fails', async () => {
    const createRow = vi.fn((values: Readonly<Partial<CreateValues>>) => ({
      id: 'cross-field-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const beforeSubmit = vi.fn(() => true);
    const { api } = createTestTable('create-cross-field-validation');
    const editor = new AltEditorLite<TestRow, CreateValues>(api, {
      clientSide: { createRow },
      fields,
      hooks: { beforeSubmit },
      validateForm: (values, context) => {
        expect(Object.isFrozen(values)).toBe(true);
        expect(context.operation).toBe('create');
        expect(context.mode).toBe('dialog');
        return {
          fieldErrors: {
            rank: 'Rank must be at least the length of the name.',
          },
          message: 'Review the related values.',
          valid: false,
        };
      },
    });
    activeEditors.add(editor);
    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Long name');
    editor.getField('rank')?.setValue(2);

    submitOpenDialog();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });

    expect(createRow).not.toHaveBeenCalled();
    expect(beforeSubmit).not.toHaveBeenCalled();
    expect(api.rows().count()).toBe(5);
    expect(
      editor.getField('rank')?.element.querySelector('.alteditor-lite-field__error')
        ?.textContent,
    ).toContain('Rank must be at least the length of the name.');
    expect(
      document.querySelector('.alteditor-lite-form__submission-error')?.textContent,
    ).toContain('Review the related values.');
  });

  it('applies initial dependencies and waits for the latest update before submit', async () => {
    let resolveUpdate:
      | ((result: {
          readonly region: {
            readonly options: readonly [
              { readonly label: string; readonly value: string },
            ];
            readonly required: boolean;
            readonly value: string;
            readonly visible: boolean;
          };
        }) => void)
      | undefined;
    const pendingUpdate = new Promise<{
      readonly region: {
        readonly options: readonly [{ readonly label: string; readonly value: string }];
        readonly required: boolean;
        readonly value: string;
        readonly visible: boolean;
      };
    }>((resolve) => {
      resolveUpdate = resolve;
    });
    const createRow = vi.fn((values: Readonly<Partial<LocationValues>>) => ({
      id: 'dependent-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const { api } = createTestTable('dependent-create');
    const editor = new AltEditorLite<TestRow, LocationValues>(api, {
      clientSide: { createRow },
      dependencies: {
        country: (country) =>
          country === 'JP'
            ? {
                region: {
                  options: [{ label: 'Tokyo', value: 'tokyo' }],
                  required: true,
                  value: 'tokyo',
                  visible: true,
                },
              }
            : pendingUpdate,
      },
      fields: [
        {
          defaultValue: 'JP',
          label: 'Country',
          name: 'country',
          type: 'text',
        },
        {
          defaultValue: 'Dependent row',
          label: 'Name',
          name: 'name',
          type: 'text',
        },
        {
          defaultValue: 6,
          label: 'Rank',
          name: 'rank',
          type: 'number',
        },
        {
          label: 'Region',
          name: 'region',
          options: [{ label: 'Unassigned', value: 'none' }],
          type: 'select',
          visible: false,
        },
      ],
    });
    activeEditors.add(editor);

    await editor.openCreateDialog();
    expect(editor.getField('region')?.isVisible()).toBe(true);
    await expect(editor.getField('region')?.getValue()).resolves.toBe('tokyo');

    editor.getField('country')?.setValue('CA');
    editor
      .getField('country')
      ?.element.querySelector('input')
      ?.dispatchEvent(new Event('input', { bubbles: true }));
    submitOpenDialog();
    await Promise.resolve();
    expect(createRow).not.toHaveBeenCalled();

    if (resolveUpdate === undefined) {
      throw new Error('Expected a pending dependency update.');
    }
    resolveUpdate({
      region: {
        options: [{ label: 'Ontario', value: 'ontario' }],
        required: true,
        value: 'ontario',
        visible: true,
      },
    });
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(createRow).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'CA', region: 'ontario' }),
    );
  });

  it('keeps persistence unavailable until a dependency failure is resolved', async () => {
    const createRow = vi.fn((values: Readonly<Partial<CreateValues>>) => ({
      id: 'dependency-recovery-row',
      name: values.name ?? '',
      rank: values.rank ?? 0,
    }));
    const { api, tableElement } = createTestTable('dependency-recovery');
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);
    const editor = new AltEditorLite<TestRow, CreateValues>(api, {
      clientSide: { createRow },
      dependencies: {
        name: (name) =>
          name === 'Unavailable'
            ? Promise.reject(
                new AltEditorLiteError({
                  code: 'LOOKUP_UNAVAILABLE',
                  message: 'Dependent data is unavailable.',
                  retryable: true,
                }),
              )
            : {},
      },
      fields,
    });
    activeEditors.add(editor);

    await editor.openCreateDialog();
    editor.getField('name')?.setValue('Unavailable');
    editor
      .getField('name')
      ?.element.querySelector('input')
      ?.dispatchEvent(new Event('input', { bubbles: true }));
    editor.getField('rank')?.setValue(7);
    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalledOnce();
    });
    submitOpenDialog();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(createRow).not.toHaveBeenCalled();

    editor.getField('name')?.setValue('Recovered');
    editor
      .getField('name')
      ?.element.querySelector('input')
      ?.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(
        document.querySelector<HTMLElement>('.alteditor-lite-form__submission-error')
          ?.hidden,
      ).toBe(true);
    });
    submitOpenDialog();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(createRow).toHaveBeenCalledOnce();
  });

  it('aborts initial dependency work when the editor is destroyed', async () => {
    let dependencySignal: AbortSignal | undefined;
    let resolveDependency:
      ((result: { readonly rank: { readonly value: number } }) => void) | undefined;
    const pendingDependency = new Promise<{
      readonly rank: { readonly value: number };
    }>((resolve) => {
      resolveDependency = resolve;
    });
    const { api, tableElement } = createTestTable('destroy-dependency-open');
    const errorListener = vi.fn();
    tableElement.addEventListener('alteditor-lite:error', errorListener);
    const editor = new AltEditorLite<TestRow, CreateValues>(api, {
      clientSide: {
        createRow: (values) => ({
          id: 'unused-row',
          name: values.name ?? '',
          rank: values.rank ?? 0,
        }),
      },
      dependencies: {
        name: (_name, { signal }) => {
          dependencySignal = signal;
          return pendingDependency;
        },
      },
      fields,
    });
    activeEditors.add(editor);

    const opening = editor.openCreateDialog();
    await vi.waitFor(() => {
      expect(dependencySignal).toBeDefined();
    });
    editor.destroy();

    await expect(opening).rejects.toThrow(EditorDestroyedError);
    expect(dependencySignal?.aborted).toBe(true);
    expect(errorListener).not.toHaveBeenCalled();
    resolveDependency?.({ rank: { value: 99 } });
    await Promise.resolve();
    expect(document.querySelector('.alteditor-lite-dialog')).toBeNull();
  });

  it('uses a custom Create layout while preserving validation focus and errors', async () => {
    const template = document.createElement('template');
    template.id = 'create-form-layout';
    template.innerHTML = `
      <section class="custom-create-layout">
        <div data-alteditor-lite-field="rank"></div>
        <div data-alteditor-lite-field="name"></div>
      </section>
    `;
    document.body.append(template);
    const { api, tableElement } = createTestTable('custom-create-layout');
    const editor = new AltEditorLite<TestRow, CreateValues>(api, {
      clientSide: {
        createRow: (values) => ({
          id: 'custom-layout-row',
          name: values.name ?? '',
          rank: values.rank ?? 0,
        }),
      },
      editing: { dialog: { template: '#create-form-layout' } },
      fields,
    });
    activeEditors.add(editor);

    await editor.openCreateDialog();
    const nameSlot = tableElement.ownerDocument.querySelector<HTMLElement>(
      '[data-alteditor-lite-field="name"]',
    );
    const rankSlot = tableElement.ownerDocument.querySelector<HTMLElement>(
      '[data-alteditor-lite-field="rank"]',
    );
    expect(
      [...(rankSlot?.parentElement?.children ?? [])].map((element) =>
        element.getAttribute('data-alteditor-lite-field'),
      ),
    ).toEqual(['rank', 'name']);
    editor.getField('rank')?.setValue(8);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
      expect(nameSlot?.querySelector('[aria-invalid="true"]')).not.toBeNull();
    });
    expect(document.activeElement).toBe(
      nameSlot?.querySelector('.alteditor-lite-field__control'),
    );

    editor.getField('name')?.setValue('Custom layout');
    submitOpenDialog();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });
    expect(api.row('#custom-layout-row').data()).toMatchObject({
      name: 'Custom layout',
      rank: 8,
    });
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
    editor.getField('name')?.setValue('Retry');
    editor.getField('rank')?.setValue(4);
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
    editor.getField('name')?.setValue('Async');
    editor.getField('rank')?.setValue(5);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
      expect(
        document.querySelector('.alteditor-lite-dialog__errors')?.textContent,
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
    editor.getField('name')?.setValue('Invalid');
    editor.getField('rank')?.setValue(6);
    submitOpenDialog();

    await vi.waitFor(() => {
      expect(errorListener).toHaveBeenCalledOnce();
    });
    expect(editor.getState()).toMatchObject({ action: 'create', status: 'open' });
    expect(api.rows().count()).toBe(5);
    expect(
      document.querySelector('.alteditor-lite-dialog__errors')?.textContent,
    ).toContain('must return a complete row object');
  });

  it('keeps the dialog open when configured', async () => {
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
    editor.getField('name')?.setValue('Stay');
    editor.getField('rank')?.setValue(2);
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
    const formElement = document.querySelector<HTMLFormElement>('.alteditor-lite-form');

    editor.destroy();
    formElement?.dispatchEvent(
      new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(destroyListener).toHaveBeenCalledOnce();
    expect(document.querySelector('.alteditor-lite-dialog')).toBeNull();
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
    editor.getField('name')?.setValue('Observer');
    editor.getField('rank')?.setValue(7);
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
