import DataTable, { type Api } from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { hasSelectIntegration } from '../../src/datatables/select-integration.js';
import {
  AltEditorLite,
  registerAltEditorLite,
  type FieldConfig,
} from '../../src/index.js';
import zhCn from '../../src/locales/zh-cn.json' with { type: 'json' };

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

import type { PartialEditorLanguage } from '../../src/core/alt-editor-lite-language.js';

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

const activeEditors = new Set<AltEditorLite<TestRow, ExtensionValues>>();
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
  const colReorderRuntimeSpecifier = 'datatables.net-colreorder';
  const keyTableRuntimeSpecifier = 'datatables.net-keytable';
  const selectRuntimeSpecifier = 'datatables.net-select';
  await import(buttonsRuntimeSpecifier);
  await import(colReorderRuntimeSpecifier);
  await import(keyTableRuntimeSpecifier);
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
  destroyTestTables();
});

function createExtensionEditor(
  tableId: string,
  language?: Readonly<PartialEditorLanguage>,
): {
  readonly api: Api<TestRow>;
  readonly editor: AltEditorLite<TestRow, ExtensionValues>;
  readonly extensionApi: ExtensionsApi;
  readonly tableElement: HTMLTableElement;
} {
  const { api, tableElement } = createTestTable(tableId, {
    layout: {
      topStart: {
        buttons: [
          { attr: { tabindex: '7' }, extend: 'altEditorLiteCreate' },
          'altEditorLiteEdit',
          'altEditorLiteRemove',
          'altEditorLiteRefresh',
        ],
      },
    },
    select: true,
  });
  const editor = new AltEditorLite<TestRow, ExtensionValues>(api, {
    clientSide: {
      createRow: (values) => ({
        id: 'extension-created',
        name: values.name ?? '',
        rank: values.rank ?? 0,
      }),
    },
    fields,
    ...(language === undefined ? {} : { language }),
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
  it('detects Select through its API even when the table is empty', () => {
    const { api } = createTestTable('empty-select-table', {
      data: [],
      select: true,
    });

    expect(hasSelectIntegration(api)).toBe(true);
  });

  it('localizes button labels, button explanations, and Remove target count', async () => {
    const { editor, extensionApi, tableElement } = createExtensionEditor(
      'localized-buttons',
      zhCn,
    );
    const createButton = buttonByText(tableElement, '新建');
    const editButton = buttonByText(tableElement, '编辑');
    const removeButton = buttonByText(tableElement, '删除');
    const refreshButton = buttonByText(tableElement, '刷新');

    expect(createButton.title).toBe('新建行');
    expect(createButton.getAttribute('tabindex')).toBe('7');
    expect(editButton.title).toBe('请选择且仅选择一行进行编辑。');
    expect(removeButton.title).toBe('请至少选择一行进行删除。');
    expect(refreshButton.title).toBe('刷新');

    extensionApi.row(0).select();
    extensionApi.row(1).select();
    removeButton.click();
    await vi.waitFor(() => {
      expect(editor.getState()).toMatchObject({ action: 'remove', status: 'open' });
    });

    expect(
      document.querySelector('.dt-alteditor-lite-remove-confirmation__count')
        ?.textContent,
    ).toBe('已选行数：2。');
    expect(
      document.querySelector('.dt-alteditor-lite-remove-confirmation__warning')
        ?.textContent,
    ).toBe('请确认是否删除所选行。');
    await editor.closeDialog();
  });

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

describe('optional KeyTable and ColReorder integration', () => {
  interface CellFocusApi {
    focus(): void;
  }

  interface ExtensionTableApi {
    readonly colReorder: {
      move(from: number, to: number): void;
    };
    readonly keys: {
      enable(state: true | 'navigation-only'): void;
      enabled(): true | false | 'navigation-only';
    };
  }

  const inlineFields = fields.map((field) => ({
    ...field,
    inlineEdit: true,
  })) satisfies readonly FieldConfig<ExtensionValues>[];

  it('releases the activation shortcut while editing and restores KeyTable', async () => {
    const { api } = createTestTable('keytable-inline', {
      columns: [
        { data: 'name', name: 'name' },
        { data: 'rank', name: 'rank' },
      ],
      keys: true,
    });
    const extensionApi = api as unknown as ExtensionTableApi;
    extensionApi.keys.enable('navigation-only');
    const editor = new AltEditorLite<TestRow, ExtensionValues>(api, {
      editMode: 'inlineDoubleClick',
      fields: inlineFields,
      inline: { keyboardActivation: { key: 'Enter' } },
    });
    activeEditors.add(editor);

    (api.cell('#row-a', 0) as unknown as CellFocusApi).focus();
    const cell = api.cell('#row-a', 0).node();
    cell.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    );
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    expect(extensionApi.keys.enabled()).toBe(false);

    const input = cell.querySelector<HTMLInputElement>('input');
    if (input === null) {
      throw new Error('Expected an open inline input.');
    }
    input.value = 'Keyboard edit';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }),
    );
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('idle');
    });

    expect(api.row('#row-a').data().name).toBe('Keyboard edit');
    expect(extensionApi.keys.enabled()).toBe('navigation-only');
  });

  it('rebuilds mappings after completed column reorder without recreating the editor', async () => {
    const { api } = createTestTable('colreorder-inline', {
      colReorder: true,
      columns: [
        { data: 'name', name: 'name' },
        { data: 'rank', name: 'rank' },
      ],
      keys: true,
    });
    const extensionApi = api as unknown as ExtensionTableApi;
    const editor = new AltEditorLite<TestRow, ExtensionValues>(api, {
      editMode: 'inlineHover',
      fields: inlineFields,
    });
    activeEditors.add(editor);

    extensionApi.colReorder.move(0, 1);
    const nameCell = api.cell('#row-a', 1).node();
    nameCell.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
    nameCell
      .querySelector<HTMLButtonElement>('.alteditor-lite-inline-hover__trigger')
      ?.click();
    await vi.waitFor(() => {
      expect(editor.getInlineState().status).toBe('editing');
    });
    expect(nameCell.querySelector<HTMLInputElement>('input')?.value).toBe('Alpha');
    await editor.cancelInlineEdit();
  });
});
