import DataTable, { type Api } from 'datatables.net';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createContractTable,
  destroyContractTables,
  type ContractRow,
} from './datatables-contract-fixture.js';

interface OptionalExtensionApi {
  button(buttonIndex: number): {
    trigger(): void;
  };
  row(rowIndex: number): {
    select(): void;
  };
  rows(modifier: { readonly selected: boolean }): {
    count(): number;
  };
}

afterEach(() => {
  destroyContractTables();
});

describe('DataTables optional extension contracts', () => {
  it('initializes core without Buttons, Select, or jQuery', () => {
    const { api, tableElement } = createContractTable();

    expect('Buttons' in DataTable).toBe(false);
    expect('select' in DataTable).toBe(false);
    expect('select' in api.row(0)).toBe(false);
    expect(api.table().node()).toBe(tableElement);
    expect('jQuery' in globalThis).toBe(false);
  });

  it('exposes Buttons action context and cleans up Select listeners', async () => {
    Object.defineProperty(window, 'DataTable', {
      configurable: true,
      value: DataTable,
    });

    const buttonsRuntimeSpecifier = 'datatables.net-buttons';
    const selectRuntimeSpecifier = 'datatables.net-select';

    await import(buttonsRuntimeSpecifier);
    await import(selectRuntimeSpecifier);

    let actionTableElement: HTMLTableElement | null = null;
    let isActionContextApi = false;
    let selectEventCount = 0;
    let selectedIndexes: unknown;
    let selectionType: unknown;

    DataTable.ext.buttons['contractAction'] = {
      action(this: unknown, _event: MouseEvent, actionApi: Api<ContractRow>): void {
        isActionContextApi = this instanceof DataTable.Api;
        actionTableElement = actionApi.table().node();
      },
      text: 'Contract action',
    };

    const { api, tableElement } = createContractTable('extension-contract-table', {
      layout: {
        topStart: {
          buttons: ['contractAction'],
        },
      },
      select: true,
    });
    const extensionApi = api as Api<ContractRow> & OptionalExtensionApi;
    const selectListener = (
      _event: Event,
      selectedRowsApi: Api<ContractRow>,
      selectedType: unknown,
      rowIndexes: unknown,
    ): void => {
      expect(selectedRowsApi.table().node()).toBe(tableElement);
      selectEventCount += 1;
      selectedIndexes = rowIndexes;
      selectionType = selectedType;
    };

    extensionApi.button(0).trigger();
    expect(isActionContextApi).toBe(true);
    expect(actionTableElement).toBe(tableElement);

    api.on('select.contract', selectListener);
    extensionApi.row(0).select();

    expect(selectEventCount).toBe(1);
    expect(selectionType).toBe('row');
    expect(selectedIndexes).toEqual([0]);
    expect(extensionApi.rows({ selected: true }).count()).toBe(1);

    api.off('select.contract', selectListener);
    extensionApi.row(1).select();

    expect(selectEventCount).toBe(1);
    expect(extensionApi.rows({ selected: true }).count()).toBe(2);

    delete DataTable.ext.buttons['contractAction'];
  });
});
