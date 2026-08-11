import { describe, expect, it, vi } from 'vitest';

import { synchronizeExtensionStateAfterCommit } from '../../src/datatables/synchronize-extension-state.js';

import type { Api } from 'datatables.net';

interface TestRow {
  readonly id: string;
}

describe('synchronizeExtensionStateAfterCommit', () => {
  it('refreshes registered ColumnControl and Responsive public APIs', () => {
    const refreshSearchList = vi.fn();
    const recalculateResponsive = vi.fn();
    const table = {
      columns: () => ({
        columnControl: {
          searchList: refreshSearchList,
        },
      }),
      responsive: {
        recalc: recalculateResponsive,
      },
    } as unknown as Api<TestRow>;

    synchronizeExtensionStateAfterCommit(table);

    expect(refreshSearchList).toHaveBeenCalledWith('refresh');
    expect(recalculateResponsive).toHaveBeenCalledOnce();
  });

  it('isolates optional extension failures from the committed operation', () => {
    const columnControlError = new Error('ColumnControl failed.');
    const responsiveError = new Error('Responsive failed.');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const table = {
      columns: () => ({
        columnControl: {
          searchList: () => {
            throw columnControlError;
          },
        },
      }),
      responsive: {
        recalc: () => {
          throw responsiveError;
        },
      },
    } as unknown as Api<TestRow>;

    expect(() => {
      synchronizeExtensionStateAfterCommit(table);
    }).not.toThrow();
    expect(warning).toHaveBeenCalledTimes(2);
    expect(warning.mock.calls[0]?.[1]).toBe(columnControlError);
    expect(warning.mock.calls[1]?.[1]).toBe(responsiveError);

    warning.mockRestore();
  });
});
