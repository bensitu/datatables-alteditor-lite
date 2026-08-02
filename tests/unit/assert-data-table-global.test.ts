import { describe, expect, it } from 'vitest';

import {
  assertDataTableGlobal,
  hasDataTableGlobal,
} from '../../src/datatables/assert-data-table-global.js';

describe('browser-global DataTables boundary', () => {
  it('accepts a callable DataTables constructor', () => {
    const dataTable = Object.assign(() => undefined, {
      version: '3.0.1',
    });
    Object.defineProperty(dataTable, 'Api', {
      value: () => undefined,
    });
    const runtimeScope = {
      DataTable: dataTable,
    };

    expect(hasDataTableGlobal(runtimeScope)).toBe(true);
    expect(() => {
      assertDataTableGlobal(runtimeScope);
    }).not.toThrow();
  });

  it('rejects an unrelated function using the DataTable name', () => {
    expect(hasDataTableGlobal({ DataTable: () => undefined })).toBe(false);
  });

  it('rejects a missing DataTables constructor with a stable loading-order error', () => {
    const runtimeScope = {};

    expect(hasDataTableGlobal(runtimeScope)).toBe(false);
    expect(() => {
      assertDataTableGlobal(runtimeScope);
    }).toThrow('DataTables must be loaded before datatables-alteditor-lite.');
  });
});
