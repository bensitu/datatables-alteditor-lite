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

  it('rebinds record targets when rows are replaced or removed', async () => {
    const { api } = createTestTable('host-record-rebinding');
    const host = new DataTablesHost(api);
    const target = host.resolveRecordTarget('#row-a');
    const previousRow = api.row('#row-a').data();
    const replacementRow = { ...previousRow, name: 'Updated Alpha' };
    const context = {
      mode: 'dialog',
      operation: 'edit',
      signal: new AbortController().signal,
    } as const;

    await host.applyUpdate(target, replacementRow, context);

    expect(host.findRecordTarget(previousRow)).toBeUndefined();
    expect(host.findRecordTarget(replacementRow)).toBe(target);
    expect(host.read(target)).toBe(replacementRow);

    await host.applyRemove([target], { ...context, operation: 'remove' });

    expect(host.findRecordTarget(replacementRow)).toBeUndefined();
    host.destroy();
  });
});
