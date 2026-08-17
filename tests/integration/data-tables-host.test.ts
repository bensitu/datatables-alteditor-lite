import { afterEach, describe, expect, it } from 'vitest';

import { DataTablesHost } from '../../src/datatables/data-tables-host.js';

import { destroyTestTables, createTestTable } from './datatables-test-fixture.js';

describe('DataTablesHost', () => {
  afterEach(() => {
    destroyTestTables();
  });

  it('returns its owned DataTables API through the explicit escape hatch', () => {
    const { api } = createTestTable('host-unwrap');
    const host = new DataTablesHost(api);

    expect(host.unwrap()).toBe(api);

    host.destroy();
  });
});
