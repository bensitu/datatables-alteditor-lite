import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLogicalCellTarget } from '../../src/datatables/commit-row-update.js';
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

  it('keeps record mappings unchanged when application is already cancelled', async () => {
    const { api } = createTestTable('host-cancelled-update');
    const host = new DataTablesHost(api);
    const target = host.resolveRecordTarget('#row-a');
    const original = api.row('#row-a').data();
    const replacement = { ...original, name: 'Cancelled replacement' };
    const abortController = new AbortController();
    abortController.abort();

    await host.applyUpdate(target, replacement, {
      mode: 'dialog',
      operation: 'edit',
      signal: abortController.signal,
    });

    expect(api.row('#row-a').data()).toBe(original);
    expect(host.findRecordTarget(original)).toBe(target);
    expect(host.findRecordTarget(replacement)).toBeUndefined();
    host.destroy();
  });

  it('resolves a committed cell by stable row id after row data is refreshed', () => {
    const { api } = createTestTable('host-refreshed-focus');
    const original = api.row('#row-a').data();
    const rowIndex = api.row('#row-a').index();
    api
      .row('#row-a')
      .data({ ...original })
      .draw(false);

    const cell = resolveLogicalCellTarget(
      api,
      {
        columnIndex: 0,
        row: original,
        rowId: 'row-a',
        rowIndex,
      },
      'The cell is unavailable.',
    );

    expect(cell).toBe(api.cell('#row-a', 0).node());
  });

  it('applies distinct replacement rows with one draw and refreshes their targets', async () => {
    const { api } = createTestTable('host-batch-update');
    const host = new DataTablesHost(api);
    const targets = host.resolveRecordTargets([0, 1]);
    const firstTarget = targets[0];
    const secondTarget = targets[1];
    if (firstTarget === undefined || secondTarget === undefined) {
      throw new Error('Expected two DataTables record targets.');
    }
    const first = api.row(0).data();
    const second = api.row(1).data();
    const firstReplacement = { ...first, name: 'Updated Alpha' };
    const secondReplacement = { ...second, name: 'Updated Beta' };
    const draw = vi.fn();
    api.on('draw', draw);

    await host.applyUpdates(
      [
        { row: firstReplacement, target: firstTarget },
        { row: secondReplacement, target: secondTarget },
      ],
      {
        mode: 'dialog',
        operation: 'batchEdit',
        signal: new AbortController().signal,
      },
    );

    expect(draw).toHaveBeenCalledOnce();
    expect(host.read(firstTarget)).toBe(firstReplacement);
    expect(host.read(secondTarget)).toBe(secondReplacement);
    expect(host.findRecordTarget(first)).toBeUndefined();
    expect(host.findRecordTarget(second)).toBeUndefined();
    host.destroy();
  });

  it('resolves every target before replacing any DataTables row', async () => {
    const { api } = createTestTable('host-batch-prevalidation');
    const { api: otherApi } = createTestTable('host-batch-foreign-target');
    const host = new DataTablesHost(api);
    const otherHost = new DataTablesHost(otherApi);
    const original = api.row(0).data();
    const target = host.resolveRecordTarget(0);
    const foreignTarget = otherHost.resolveRecordTarget(1);

    await expect(
      host.applyUpdates(
        [
          { row: { ...original, name: 'Changed' }, target },
          { row: otherApi.row(1).data(), target: foreignTarget },
        ],
        {
          mode: 'dialog',
          operation: 'batchEdit',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow('not created by this DataTables host');

    expect(api.row(0).data()).toBe(original);
    host.destroy();
    otherHost.destroy();
  });

  it('rejects duplicate batch targets before replacing a DataTables row', async () => {
    const { api } = createTestTable('host-batch-duplicate-target');
    const host = new DataTablesHost(api);
    const target = host.resolveRecordTarget(0);
    const original = api.row(0).data();

    await expect(
      host.applyUpdates(
        [
          { row: { ...original, name: 'First replacement' }, target },
          { row: { ...original, name: 'Second replacement' }, target },
        ],
        {
          mode: 'dialog',
          operation: 'batchEdit',
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow('must identify distinct records');

    expect(api.row(0).data()).toBe(original);
    host.destroy();
  });

  it('supports batch replacement without stable row ids', async () => {
    const { api } = createTestTable('host-batch-without-row-id', {
      rowId: 'unavailableId',
    });
    const host = new DataTablesHost(api);
    const targets = host.resolveRecordTargets([0, 1]);
    const firstTarget = targets[0];
    const secondTarget = targets[1];
    if (firstTarget === undefined || secondTarget === undefined) {
      throw new Error('Expected two DataTables record targets.');
    }
    const firstReplacement = { ...api.row(0).data(), rank: 10 };
    const secondReplacement = { ...api.row(1).data(), rank: 20 };

    await host.applyUpdates(
      [
        { row: firstReplacement, target: firstTarget },
        { row: secondReplacement, target: secondTarget },
      ],
      {
        mode: 'dialog',
        operation: 'batchEdit',
        signal: new AbortController().signal,
      },
    );

    expect(host.read(firstTarget)).toBe(firstReplacement);
    expect(host.read(secondTarget)).toBe(secondReplacement);
    host.destroy();
  });
});
