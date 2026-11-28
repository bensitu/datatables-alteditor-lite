import { AllCommunityModule, createGrid } from 'ag-grid-community';
import { afterEach, expect, it, vi } from 'vitest';

import { AgGridHost, AltEditorLite } from '../../src/ag-grid.js';

import { describeEditorHostContract } from './editor-host-contract.js';

const grids = [];
const context = {
  signal: new AbortController().signal,
  mode: 'dialog',
  operation: 'batchEdit',
};

function createFixture() {
  const element = globalThis.document.createElement('div');
  globalThis.document.body.append(element);
  const api = createGrid(
    element,
    {
      theme: 'legacy',
      getRowId: ({ data }) => data.id,
      columnDefs: [{ field: 'name' }],
      rowData: [
        { id: 'row-a', name: 'Alpha', rank: 1 },
        { id: 'row-b', name: 'Beta', rank: 2 },
      ],
    },
    { modules: [AllCommunityModule] },
  );
  grids.push(api);
  const host = new AgGridHost(api);
  return { api, host, eventTarget: api.getGridElement(), initialTarget: 'row-a' };
}

afterEach(() => {
  for (const api of grids.splice(0)) api.destroy();
  globalThis.document.body.replaceChildren();
});

describeEditorHostContract('AgGridHost', createFixture);

it('resolves every ID before updating and restores an incomplete grid transaction', async () => {
  const { api, host } = createFixture();
  const changes = ['row-a', 'row-b'].map((target) => ({
    target,
    row: { id: target, name: 'Updated', rank: 3 },
  }));
  await expect(
    host.applyUpdates([changes[0], { ...changes[1], target: 'missing' }], context),
  ).rejects.toThrow();
  expect(host.read('row-a').name).toBe('Alpha');

  const apply = api.applyTransaction.bind(api);
  vi.spyOn(api, 'applyTransaction').mockImplementationOnce(({ update }) =>
    apply({ update: update.slice(0, 1) }),
  );
  await expect(host.applyUpdates(changes, context)).rejects.toMatchObject({
    code: 'GRID_TRANSACTION',
  });
  expect(host.read('row-a').name).toBe('Alpha');
  expect(host.read('row-b').name).toBe('Beta');
  await host.applyUpdates(changes, context);
  expect(host.read('row-b').name).toBe('Updated');
});

it('restores only the removals reported by an incomplete grid transaction', async () => {
  const { api, host } = createFixture();
  api.setGridOption('rowSelection', { mode: 'multiRow' });
  api.getRowNode('row-a').setSelected(true);
  const apply = api.applyTransaction.bind(api);
  vi.spyOn(api, 'applyTransaction').mockImplementationOnce(({ remove }) => {
    const result = apply({ remove: [remove[0]] });
    apply({ remove: [remove[1]] });
    return result;
  });
  await expect(host.applyRemove(['row-a', 'row-b'], context)).rejects.toMatchObject({
    code: 'GRID_TRANSACTION',
  });
  expect(host.read('row-a').name).toBe('Alpha');
  expect(host.getSelectedTargets()).toEqual(['row-a']);
  expect(api.getRowNode('row-b')?.id).toBeUndefined();
});

it('rejects changed IDs and cancels an outstanding refresh when the grid is destroyed', async () => {
  const { api, host } = createFixture();
  await expect(
    host.applyUpdate('row-a', { id: 'row-b', name: 'Updated', rank: 3 }, context),
  ).rejects.toThrow('retain its row ID');
  expect(host.read('row-b').name).toBe('Beta');
  const started = Promise.withResolvers();
  const finished = Promise.withResolvers();
  const editor = new AltEditorLite(host, {
    fields: [{ name: 'name', type: 'text', label: 'Name' }],
    operations: {
      refresh({ signal }) {
        started.resolve(signal);
        return finished.promise;
      },
    },
  });
  const pending = editor.refresh();
  const signal = await started.promise;
  api.destroy();
  await pending;
  finished.resolve();
  expect(signal.aborted).toBe(true);
  expect(() => editor.getState()).toThrow();
  expect(() => host.read('row-a')).toThrow();
});
