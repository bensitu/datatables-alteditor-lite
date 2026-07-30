import DataTable, { type Api } from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  registerAltEditorLite,
  type FieldConfig,
} from '../../src/index.js';

import {
  createContractTable,
  destroyContractTables,
  type ContractRow,
} from './datatables-contract-fixture.js';

interface ExtensionValues {
  readonly name: string;
  readonly rank: number;
}

interface SelectableRowApi {
  deselect(): SelectableRowApi;
  select(): SelectableRowApi;
}

interface TriggerableButtonApi {
  trigger(): void;
}

interface ExtensionsApi {
  button(buttonIndex: number): TriggerableButtonApi;
  row(rowIndex: number): SelectableRowApi;
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
] satisfies readonly FieldConfig<ExtensionValues>[];

const activeEditors = new Set<AltEditorLite<ContractRow, ExtensionValues>>();
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
  const selectRuntimeSpecifier = 'datatables.net-select';
  await import(buttonsRuntimeSpecifier);
  await import(selectRuntimeSpecifier);
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
  for (const editor of activeEditors) {
    editor.destroy();
  }
  activeEditors.clear();
  destroyContractTables();
});

function createExtensionEditor(tableId: string): {
  readonly api: Api<ContractRow>;
  readonly editor: AltEditorLite<ContractRow, ExtensionValues>;
  readonly extensionApi: ExtensionsApi;
  readonly tableElement: HTMLTableElement;
} {
  const { api, tableElement } = createContractTable(tableId, {
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
    select: true,
  });
  const editor = new AltEditorLite<ContractRow, ExtensionValues>(api, {
    clientSide: {
      createRow: (values) => ({
        id: 'extension-created',
        name: values.name ?? '',
        rank: values.rank ?? 0,
      }),
    },
    fields,
  });
  activeEditors.add(editor);
  return {
    api,
    editor,
    extensionApi: api as unknown as ExtensionsApi,
    tableElement,
  };
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

describe('optional Buttons and Select integration', () => {
  it('updates button enablement from editor state and row selection', async () => {
    const { editor, extensionApi, tableElement } = createExtensionEditor('button-state');
    const createButton = buttonByText(tableElement, 'Create');
    const editButton = buttonByText(tableElement, 'Edit');
    const removeButton = buttonByText(tableElement, 'Remove');
    const refreshButton = buttonByText(tableElement, 'Refresh');

    expect(createButton.disabled).toBe(false);
    expect(refreshButton.disabled).toBe(false);
    expect(editButton.disabled).toBe(true);
    expect(editButton.getAttribute('aria-disabled')).toBe('true');
    expect(editButton.title).toContain('exactly one');
    expect(removeButton.disabled).toBe(true);

    extensionApi.row(0).select();
    expect(editButton.disabled).toBe(false);
    expect(removeButton.disabled).toBe(false);
    expect(editButton.getAttribute('aria-disabled')).toBe('false');

    extensionApi.button(0).trigger();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('open');
    });
    expect(createButton.disabled).toBe(true);
    expect(refreshButton.disabled).toBe(true);
    await editor.closeDialog();
    expect(createButton.disabled).toBe(false);

    editor.destroy();
    expect(createButton.disabled).toBe(true);
    expect(editButton.disabled).toBe(true);
    extensionApi.row(1).select();
    expect(editButton.disabled).toBe(true);
  });

  it('keeps Edit bound to the opening selection and Remove confirms current snapshot', async () => {
    const { api, editor, extensionApi } = createExtensionEditor('selection-snapshot');
    extensionApi.row(0).select();
    extensionApi.button(1).trigger();
    await vi.waitFor(() => {
      expect(editor.getState()).toMatchObject({
        action: 'edit',
        status: 'open',
      });
    });

    editor.getField<string>('name')?.setValue('Opening selection');
    extensionApi.row(0).deselect();
    extensionApi.row(1).select();
    api.search('Gamma').draw();
    submitForm();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });

    expect(api.row('#row-a').data().name).toBe('Opening selection');
    expect(api.row('#row-b').data().name).toBe('Beta');

    api.search('').draw();
    extensionApi.button(2).trigger();
    await vi.waitFor(() => {
      expect(editor.getState()).toMatchObject({
        action: 'remove',
        status: 'open',
      });
    });
    extensionApi.row(1).deselect();
    extensionApi.row(2).select();
    confirmRemove();
    await vi.waitFor(() => {
      expect(editor.getState().status).toBe('ready');
    });

    expect(api.row('#row-b').any()).toBe(false);
    expect(api.row('#row-c').any()).toBe(true);
    expect('jQuery' in globalThis).toBe(false);
  });
});
