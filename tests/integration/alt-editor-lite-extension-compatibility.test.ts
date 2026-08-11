import DataTable, { type Api } from 'datatables.net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  AltEditorLite,
  registerAltEditorLite,
  type FieldConfig,
} from '../../src/index.js';

import {
  createTestTable,
  destroyTestTables,
  type TestRow,
} from './datatables-test-fixture.js';

interface ExtensionValues {
  readonly name: string;
  readonly rank: number;
}

interface AutoFillControl {
  disable(): unknown;
  enable(enabled?: boolean): unknown;
  enabled(): boolean;
}

interface TableWithAutoFill {
  autoFill(): AutoFillControl;
}

interface ResponsiveControl {
  hasHidden(): boolean;
  rebuild(): unknown;
  recalc(): unknown;
}

interface TableWithResponsive {
  readonly responsive: ResponsiveControl;
}

interface RowReorderControl {
  disable(): unknown;
  enable(enabled?: boolean): unknown;
}

interface TableWithRowReorder {
  readonly rowReorder: RowReorderControl;
}

interface ColumnControlColumn {
  readonly columnControl: {
    searchList(options: 'refresh' | string[]): unknown;
  };
}

interface TableWithColumnControl {
  column(columnIndex: number): ColumnControlColumn;
}

interface SearchBuilderState {
  readonly criteria: readonly {
    readonly condition: string;
    readonly data: string;
    readonly origData: string;
    readonly type: string;
    readonly value: readonly string[];
  }[];
  readonly logic: string;
}

interface SearchBuilderControl {
  container(): { readonly length: number };
  rebuild(state?: SearchBuilderState): unknown;
}

interface TableWithSearchBuilder {
  readonly searchBuilder: SearchBuilderControl;
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

const inlineFields = fields.map((field) => ({
  ...field,
  inlineEdit: true,
})) satisfies readonly FieldConfig<ExtensionValues>[];

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

  const autoFillRuntimeSpecifier = 'datatables.net-autofill';
  const columnControlRuntimeSpecifier = 'datatables.net-columncontrol';
  const responsiveRuntimeSpecifier = 'datatables.net-responsive';
  const rowReorderRuntimeSpecifier = 'datatables.net-rowreorder';
  const searchBuilderRuntimeSpecifier = 'datatables.net-searchbuilder';
  await import(autoFillRuntimeSpecifier);
  await import(columnControlRuntimeSpecifier);
  await import(responsiveRuntimeSpecifier);
  await import(rowReorderRuntimeSpecifier);
  await import(searchBuilderRuntimeSpecifier);
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

function createEditor(api: Api<TestRow>): AltEditorLite<TestRow, ExtensionValues> {
  const editor = new AltEditorLite<TestRow, ExtensionValues>(api, { fields });
  activeEditors.add(editor);
  return editor;
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

function replaceInlineValue(value: string): void {
  const input = document.querySelector<HTMLInputElement>('.alteditor-lite-inline input');
  if (input === null) {
    throw new Error('Expected an open inline input.');
  }

  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function editFirstRow(
  api: Api<TestRow>,
  editor: AltEditorLite<TestRow, ExtensionValues>,
  nextName: string,
): Promise<void> {
  await editor.openEditDialog('#row-a');
  editor.getField<string>('name')?.setValue(nextName);
  submitForm();

  await vi.waitFor(() => {
    expect(editor.getState().status).toBe('ready');
  });
  expect(api.row('#row-a').data().name).toBe(nextName);
}

function destroyEditor(editor: AltEditorLite<TestRow, ExtensionValues>): void {
  editor.destroy();
  activeEditors.delete(editor);
}

function destroyTable(api: Api<TestRow>, tableElement: HTMLTableElement): void {
  api.destroy();
  expect(DataTable.isDataTable(tableElement)).toBe(false);
}

describe('DataTables 3 extension compatibility', () => {
  it('coexists with AutoFill through editing and destruction', async () => {
    const { api, tableElement } = createTestTable('autofill-compatibility', {
      autoFill: true,
    });
    const editor = createEditor(api);
    const extensionTable = api as unknown as TableWithAutoFill;

    expect(extensionTable.autoFill().enabled()).toBe(true);
    extensionTable.autoFill().disable();
    expect(extensionTable.autoFill().enabled()).toBe(false);
    extensionTable.autoFill().enable(true);
    expect(extensionTable.autoFill().enabled()).toBe(true);

    await editFirstRow(api, editor, 'AutoFill edit');
    destroyEditor(editor);

    extensionTable.autoFill().disable();
    expect(extensionTable.autoFill().enabled()).toBe(false);
    destroyTable(api, tableElement);
  });

  it('coexists with Responsive through editing and destruction', async () => {
    const { api, tableElement } = createTestTable('responsive-compatibility', {
      responsive: true,
    });
    const editor = new AltEditorLite<TestRow, ExtensionValues>(api, {
      editMode: 'inlineDoubleClick',
      fields: inlineFields,
    });
    activeEditors.add(editor);
    const extensionTable = api as unknown as TableWithResponsive;

    extensionTable.responsive.rebuild();
    extensionTable.responsive.recalc();
    expect(typeof extensionTable.responsive.hasHidden()).toBe('boolean');

    const originalRecalculate = extensionTable.responsive.recalc.bind(
      extensionTable.responsive,
    );
    const inlineStatesAtRecalculation: string[] = [];
    const recalculate = vi
      .spyOn(extensionTable.responsive, 'recalc')
      .mockImplementation(() => {
        inlineStatesAtRecalculation.push(editor.getInlineState().status);
        return originalRecalculate();
      });

    await editor.openInlineEdit('#row-a', 0);
    replaceInlineValue('Responsive edit');
    await editor.submitInlineEdit();

    expect(api.row('#row-a').data().name).toBe('Responsive edit');
    expect(recalculate).toHaveBeenCalledOnce();
    expect(inlineStatesAtRecalculation).toEqual(['idle']);
    recalculate.mockRestore();
    destroyEditor(editor);

    expect(() => extensionTable.responsive.recalc()).not.toThrow();
    destroyTable(api, tableElement);
  });

  it('coexists with RowReorder through editing and destruction', async () => {
    const { api, tableElement } = createTestTable('rowreorder-compatibility', {
      rowReorder: true,
    });
    const editor = createEditor(api);
    const extensionTable = api as unknown as TableWithRowReorder;
    const beforeReorder = vi.fn();
    const firstCell = api.cell('#row-a', 0).node();
    api.on('pre-row-reorder', beforeReorder);

    extensionTable.rowReorder.disable();
    firstCell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(beforeReorder).not.toHaveBeenCalled();

    extensionTable.rowReorder.enable();
    firstCell.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
      }),
    );
    expect(beforeReorder).toHaveBeenCalledOnce();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    await editFirstRow(api, editor, 'RowReorder edit');
    destroyEditor(editor);

    expect(() => extensionTable.rowReorder.disable()).not.toThrow();
    destroyTable(api, tableElement);
  });

  it('coexists with a ColumnControl search list through editing and destruction', async () => {
    const { api, tableElement } = createTestTable('columncontrol-compatibility', {
      columnControl: {
        content: ['searchList'],
        target: 0,
      },
    });
    const editor = createEditor(api);
    const extensionTable = api as unknown as TableWithColumnControl;
    expect(tableElement.querySelector('.dtcc-list')).not.toBeNull();
    extensionTable.column(0).columnControl.searchList(['First option', 'Second option']);

    const searchListText = tableElement.querySelector('.dtcc-list')?.textContent ?? '';
    expect(searchListText).toContain('First option');
    expect(searchListText).toContain('Second option');

    await editFirstRow(api, editor, 'ColumnControl edit');
    const refreshedSearchListText =
      tableElement.querySelector('.dtcc-list')?.textContent ?? '';
    expect(refreshedSearchListText).toContain('ColumnControl edit');
    expect(refreshedSearchListText).not.toContain('First option');
    destroyEditor(editor);

    expect(() =>
      extensionTable.column(0).columnControl.searchList('refresh'),
    ).not.toThrow();
    destroyTable(api, tableElement);
  });

  it('coexists with SearchBuilder through editing and destruction', async () => {
    const { api, tableElement } = createTestTable('searchbuilder-compatibility', {
      layout: {
        topStart: 'searchBuilder',
      },
    });
    const editor = createEditor(api);
    const extensionTable = api as unknown as TableWithSearchBuilder;
    const search: SearchBuilderState = {
      criteria: [
        {
          condition: '=',
          data: 'Name',
          origData: 'name',
          type: 'string',
          value: ['Alpha'],
        },
      ],
      logic: 'AND',
    };

    expect(extensionTable.searchBuilder.container().length).toBe(1);
    extensionTable.searchBuilder.rebuild(search);
    expect(api.rows({ search: 'applied' }).count()).toBe(1);
    expect(api.rows({ search: 'applied' }).data()[0]?.name).toBe('Alpha');

    extensionTable.searchBuilder.rebuild();
    expect(api.rows({ search: 'applied' }).count()).toBe(5);
    await editFirstRow(api, editor, 'SearchBuilder edit');
    destroyEditor(editor);

    expect(() => extensionTable.searchBuilder.rebuild(search)).not.toThrow();
    destroyTable(api, tableElement);
  });
});
