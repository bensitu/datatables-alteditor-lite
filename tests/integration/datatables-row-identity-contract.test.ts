import { afterEach, describe, expect, it } from 'vitest';

import {
  createContractTable,
  destroyContractTables,
} from './datatables-contract-fixture.js';

afterEach(() => {
  destroyContractTables();
});

describe('DataTables row identity contracts', () => {
  it('keeps rowId and internal row index stable across order, page, search, and draw', () => {
    const { api } = createContractTable();
    const originalIndex = api.row('#row-a').index();

    api.order([[1, 'desc']]).draw();
    expect(api.row('#row-a').id()).toBe('row-a');
    expect(api.row('#row-a').index()).toBe(originalIndex);

    api.page(1).draw('page');
    expect(api.row('#row-a').id()).toBe('row-a');
    expect(api.row('#row-a').index()).toBe(originalIndex);

    api.search('Alpha').draw();
    expect(api.row('#row-a').id()).toBe('row-a');
    expect(api.row('#row-a').index()).toBe(originalIndex);

    api.search('').draw();
    expect(api.row('#row-a').id()).toBe('row-a');
    expect(api.row('#row-a').index()).toBe(originalIndex);
  });

  it('can resolve a detached row node, requiring an explicit connectedness guard', () => {
    const { api, tableElement } = createContractTable();
    const originalRow = api.row('#row-a');
    const originalIndex = originalRow.index();
    const capturedRowNode = originalRow.node();

    expect(capturedRowNode).not.toBeNull();
    if (capturedRowNode === null) {
      throw new Error('Expected the first-page row node to be rendered.');
    }

    expect(capturedRowNode.isConnected).toBe(true);
    expect(capturedRowNode.closest('table')).toBe(tableElement);

    api.order([[1, 'desc']]).draw();

    expect(capturedRowNode.isConnected).toBe(false);
    expect(api.row(capturedRowNode).any()).toBe(true);
    expect(api.row(capturedRowNode).index()).toBe(originalIndex);
  });

  it('returns no row, node, or index after the rowId target is removed', () => {
    const { api } = createContractTable();
    const capturedRowNode = api.row('#row-a').node();

    expect(capturedRowNode).not.toBeNull();
    if (capturedRowNode === null) {
      throw new Error('Expected the target row node to be rendered.');
    }

    api.row('#row-a').remove().draw(false);

    expect(api.row('#row-a').any()).toBe(false);
    expect(api.row('#row-a').node()).toBeNull();
    expect(api.row('#row-a').index()).toBeUndefined();
    expect(capturedRowNode.isConnected).toBe(false);
    expect(api.row(capturedRowNode).any()).toBe(false);
    expect(api.row(capturedRowNode).index()).toBeUndefined();
  });

  it('scopes identical rowId selectors to each table instance', () => {
    const firstContractTable = createContractTable('first-row-identity-table');
    const secondContractTable = createContractTable('second-row-identity-table');

    expect(firstContractTable.api.row('#row-a').node()?.closest('table')).toBe(
      firstContractTable.tableElement,
    );
    expect(secondContractTable.api.row('#row-a').node()?.closest('table')).toBe(
      secondContractTable.tableElement,
    );
    expect(firstContractTable.api.row('#row-a').node()).not.toBe(
      secondContractTable.api.row('#row-a').node(),
    );
  });
});
