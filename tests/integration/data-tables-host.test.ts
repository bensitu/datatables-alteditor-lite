import { afterEach, describe, expect, it } from 'vitest';

import { DataTablesHost } from '../../src/datatables/data-tables-host.js';

import { destroyTestTables, createTestTable } from './datatables-test-fixture.js';
import { describeEditorHostContract } from './editor-host-contract.js';

afterEach(() => {
  destroyTestTables();
});

describeEditorHostContract('DataTablesHost', () => {
  const { api, tableElement } = createTestTable('host-record-contract');
  const host = new DataTablesHost(api);

  return {
    eventTarget: tableElement,
    host,
    initialTarget: host.resolveRecordTarget('#row-a'),
  };
});

describe('DataTablesHost', () => {
  it('returns its owned DataTables API through the explicit escape hatch', () => {
    const { api } = createTestTable('host-unwrap');
    const host = new DataTablesHost(api);

    expect(host.unwrap()).toBe(api);

    host.destroy();
  });
});
