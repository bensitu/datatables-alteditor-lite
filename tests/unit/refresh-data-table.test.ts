import { describe, expect, it, vi } from 'vitest';

import { refreshDataTable } from '../../src/datatables/refresh-data-table.js';

import type { Api } from 'datatables.net';

interface RefreshRow {
  readonly id: string;
}

function createAjaxTable() {
  const tableElement = document.createElement('table');
  const reload = vi.fn();
  const table = {
    ajax: { reload },
    init: () => ({ ajax: '/records' }),
    off: (event: string, listener: EventListener) => {
      tableElement.removeEventListener(event, listener);
    },
    on: (event: string, listener: EventListener) => {
      tableElement.addEventListener(event, listener);
    },
    table: () => ({ node: () => tableElement }),
  } as unknown as Api<RefreshRow>;
  return { reload, table, tableElement };
}

describe('refreshDataTable', () => {
  it('does not touch DataTables when ownership was already aborted', async () => {
    const abortController = new AbortController();
    const initialization = vi.fn();
    abortController.abort();

    await refreshDataTable(
      { init: initialization } as unknown as Api<RefreshRow>,
      abortController.signal,
    );

    expect(initialization).not.toHaveBeenCalled();
  });

  it('redraws a non-Ajax table without changing paging', async () => {
    const draw = vi.fn();
    const table = {
      draw,
      init: () => ({}),
    } as unknown as Api<RefreshRow>;

    await refreshDataTable(table, new AbortController().signal);

    expect(draw).toHaveBeenCalledWith(false);
  });

  it('rejects when an Ajax reload never reports completion', async () => {
    vi.useFakeTimers();
    try {
      const { table } = createAjaxTable();
      const refresh = refreshDataTable(table, new AbortController().signal);
      const rejection = expect(refresh).rejects.toThrow(
        'DataTables Ajax refresh did not complete in time.',
      );

      await vi.advanceTimersByTimeAsync(30_000);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a custom Ajax reload timeout', async () => {
    vi.useFakeTimers();
    try {
      const { table } = createAjaxTable();
      const refresh = refreshDataTable(table, new AbortController().signal, 1_250);
      const rejection = expect(refresh).rejects.toThrow(
        'DataTables Ajax refresh did not complete in time.',
      );

      await vi.advanceTimersByTimeAsync(1_249);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);

      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops waiting when ownership is aborted', async () => {
    vi.useFakeTimers();
    try {
      const abortController = new AbortController();
      const { table } = createAjaxTable();
      const refresh = refreshDataTable(table, abortController.signal, 1_250);

      abortController.abort();

      await expect(refresh).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves when Ajax reload reports completion', async () => {
    const { reload, table, tableElement } = createAjaxTable();
    const refresh = refreshDataTable(table, new AbortController().signal, 1_250);

    tableElement.dispatchEvent(new Event('draw.altEditorLiteRefresh'));

    await expect(refresh).resolves.toBeUndefined();
    expect(reload).toHaveBeenCalledWith(undefined, false);
  });
});
