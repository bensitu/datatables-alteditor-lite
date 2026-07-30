import DataTable, { type Api } from 'datatables.net';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createContractTable,
  destroyContractTables,
  type ContractRow,
} from './datatables-contract-fixture.js';

interface ContractApiExtension {
  contractPrimitive(): number;
  contractTableNode(): HTMLTableElement;
}

const registeredDataTableStatics = new WeakSet<object>();

function registerContractApi(dataTableStatic: typeof DataTable): void {
  if (registeredDataTableStatics.has(dataTableStatic)) {
    return;
  }

  dataTableStatic.Api.register(
    'contractPrimitive()',
    function contractPrimitive(this: Api<ContractRow>): number {
      return 42;
    },
  );
  dataTableStatic.Api.register(
    'contractTableNode()',
    function contractTableNode(this: Api<ContractRow>): HTMLTableElement {
      return this.table().node();
    },
  );
  registeredDataTableStatics.add(dataTableStatic);
}

function readPropertyRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Expected DataTables initialization options to be an object.');
  }

  return value as Readonly<Record<string, unknown>>;
}

afterEach(() => {
  destroyContractTables();
});

describe('DataTables public API contracts', () => {
  it('exposes the exact baseline and public initialization options', () => {
    const { api, tableElement } = createContractTable();
    const initialization = readPropertyRecord(api.init());

    expect(DataTable.version).toBe('3.0.0');
    expect(initialization['rowId']).toBe('id');
    expect(initialization['pageLength']).toBe(2);
    expect(api.table().node()).toBe(tableElement);
    expect(api).toBeInstanceOf(DataTable.Api);
    expect('jQuery' in globalThis).toBe(false);
    expect('jquery' in api).toBe(false);
  });

  it('registers API methods that can return non-Api values', () => {
    registerContractApi(DataTable);
    const { api, tableElement } = createContractTable();
    const extendedApi = api as Api<ContractRow> & ContractApiExtension;
    const primitiveResult = extendedApi.contractPrimitive();

    expect(primitiveResult).toBe(42);
    expect(primitiveResult).not.toBeInstanceOf(DataTable.Api);
    expect(extendedApi.contractTableNode()).toBe(tableElement);
  });

  it('keeps guarded repeated registration idempotent for a static object', () => {
    const baselineVersion = DataTable.version;

    registerContractApi(DataTable);
    registerContractApi(DataTable);

    const { api } = createContractTable();
    const extendedApi = api as Api<ContractRow> & ContractApiExtension;

    expect(DataTable.version).toBe(baselineVersion);
    expect(extendedApi.contractPrimitive()).toBe(42);
  });

  it('supports no-jQuery event subscription and exact listener cleanup', () => {
    const { api } = createContractTable();
    let drawEventCount = 0;
    const drawListener = (event: Event): void => {
      expect(event.type).toBe('draw');
      drawEventCount += 1;
    };

    api.on('draw.contract', drawListener);
    api.draw(false);
    expect(drawEventCount).toBe(1);

    api.off('draw.contract', drawListener);
    api.draw(false);
    expect(drawEventCount).toBe(1);
    expect('jQuery' in globalThis).toBe(false);
  });

  it('publishes the destroy event once through the public event API', () => {
    const { api, tableElement } = createContractTable();
    let destroyEventCount = 0;

    api.on('destroy.contract', (event: Event): void => {
      expect(event.type).toBe('destroy');
      destroyEventCount += 1;
    });
    api.destroy();

    expect(destroyEventCount).toBe(1);
    expect(DataTable.isDataTable(tableElement)).toBe(false);
  });

  it('isolates API registration results across multiple table instances', () => {
    registerContractApi(DataTable);
    const firstContractTable = createContractTable('first-contract-table');
    const secondContractTable = createContractTable('second-contract-table');
    const firstApi = firstContractTable.api as Api<ContractRow> & ContractApiExtension;
    const secondApi = secondContractTable.api as Api<ContractRow> & ContractApiExtension;

    expect(firstApi.contractTableNode()).toBe(firstContractTable.tableElement);
    expect(secondApi.contractTableNode()).toBe(secondContractTable.tableElement);
    expect(firstApi.contractTableNode()).not.toBe(secondApi.contractTableNode());
  });

  it('does not require a DataTables Plus key for an independent API extension', () => {
    registerContractApi(DataTable);
    const { api } = createContractTable();
    const extendedApi = api as Api<ContractRow> & ContractApiExtension;

    expect(typeof DataTable.key).toBe('function');
    expect(extendedApi.contractPrimitive()).toBe(42);
    expect(document.body.textContent).not.toContain('DataTables Plus');
  });
});
