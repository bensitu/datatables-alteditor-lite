import { describe, expect, it, vi } from 'vitest';

import { refreshDataTable } from '../../src/datatables/refresh-data-table.js';

import type { Api } from 'datatables.net';

interface RefreshRow {
  readonly id: string;
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
      const table = {
        ajax: { reload: vi.fn() },
        init: () => ({ ajax: '/records' }),
      } as unknown as Api<RefreshRow>;
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
});
