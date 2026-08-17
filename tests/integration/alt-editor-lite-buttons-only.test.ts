import DataTable from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  DataTablesEditor,
  registerAltEditorLite,
  type FieldConfig,
} from '../../src/datatables.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface ButtonOnlyValues {
  readonly name: string;
}

interface TriggerableButtonsApi {
  button(buttonIndex: number): {
    trigger(): void;
  };
}

const fields = [
  {
    label: 'Name',
    name: 'name',
    required: true,
    type: 'text',
  },
] satisfies readonly FieldConfig<ButtonOnlyValues>[];

let activeEditor: DataTablesEditor<TestRow, ButtonOnlyValues> | undefined;
let originalShowModalDescriptor: PropertyDescriptor | undefined;
let originalCloseDescriptor: PropertyDescriptor | undefined;

beforeAll(async () => {
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
  Object.defineProperty(window, 'DataTable', {
    configurable: true,
    value: DataTable,
  });

  const buttonsRuntimeSpecifier = 'datatables.net-buttons';
  await import(buttonsRuntimeSpecifier);
  registerAltEditorLite(DataTable);
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
  activeEditor?.destroy();
  activeEditor = undefined;
  destroyTestTables();
});

function buttonByText(tableElement: HTMLTableElement, text: string): HTMLButtonElement {
  const tableContainer = tableElement.closest('.dt-container');
  const button = [
    ...(tableContainer?.querySelectorAll<HTMLButtonElement>('button') ?? []),
  ].find((candidate) => candidate.textContent.trim() === text);
  if (button === undefined) {
    throw new Error(`Expected the ${text} button.`);
  }
  return button;
}

describe('Buttons without Select', () => {
  it('keeps Create and Refresh operational while selection actions stay disabled', async () => {
    const { api, tableElement } = createTestTable('buttons-only-table', {
      layout: {
        topStart: {
          buttons: [
            'altEditorLiteCreate',
            'altEditorLiteEdit',
            'altEditorLiteRemove',
            'altEditorLiteRefresh',
          ],
        },
      },
    });
    const editor = new DataTablesEditor<TestRow, ButtonOnlyValues>(api, {
      clientSide: {
        createRow: (values) => ({
          id: 'buttons-created',
          name: values.name ?? '',
          rank: 0,
        }),
      },
      fields,
    });
    activeEditor = editor;
    const buttonsApi = api as unknown as TriggerableButtonsApi;
    const createButton = buttonByText(tableElement, 'Create');
    const editButton = buttonByText(tableElement, 'Edit');
    const removeButton = buttonByText(tableElement, 'Remove');
    const refreshButton = buttonByText(tableElement, 'Refresh');

    expect('select' in api.row(0)).toBe(false);
    expect(createButton.disabled).toBe(false);
    expect(refreshButton.disabled).toBe(false);
    expect(editButton.disabled).toBe(true);
    expect(editButton.getAttribute('aria-disabled')).toBe('true');
    expect(editButton.title).toContain('Select is required');
    expect(removeButton.disabled).toBe(true);
    expect(removeButton.getAttribute('aria-disabled')).toBe('true');
    expect(removeButton.title).toContain('Select is required');

    buttonsApi.button(0).trigger();
    await vi.waitFor(() => {
      expect(editor.getState()).toMatchObject({
        action: 'create',
        status: 'open',
      });
    });
    await editor.closeDialog();

    const refreshSuccess = vi.fn();
    tableElement.addEventListener('alteditor-lite:success', refreshSuccess);
    buttonsApi.button(3).trigger();
    await vi.waitFor(() => {
      expect(refreshSuccess).toHaveBeenCalledOnce();
    });
    expect(editor.getState().status).toBe('ready');
  });

  it('forwards Refresh cancellation to a consumer-owned operation', async () => {
    const { api } = createTestTable('cancellable-refresh');
    let refreshSignal: AbortSignal | undefined;
    let reportStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      reportStarted = resolve;
    });
    const refresh = vi.fn(
      async (context: { readonly signal: AbortSignal }): Promise<void> => {
        refreshSignal = context.signal;
        reportStarted?.();
        await new Promise<void>((resolve) => {
          context.signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
      },
    );
    const editor = new DataTablesEditor<TestRow, ButtonOnlyValues>(api, {
      fields,
      operations: { refresh },
    });
    activeEditor = editor;

    const refreshRequest = editor.refresh();
    await started;
    expect(editor.getState().status).toBe('refreshing');
    editor.destroy();
    await refreshRequest;

    expect(refresh).toHaveBeenCalledOnce();
    expect(refreshSignal?.aborted).toBe(true);
  });
});
