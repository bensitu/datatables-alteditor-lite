import { describe, expect, it, vi } from 'vitest';

import { applyRowReplacements } from '../../src/datatables/apply-row-replacements.js';

interface TestRow {
  readonly value: string;
}

describe('DataTables row replacements', () => {
  it('applies each canonical row through its resolved writer', () => {
    const firstWrite = vi.fn();
    const secondWrite = vi.fn();
    const firstRow = { value: 'first-updated' };
    const secondRow = { value: 'second-updated' };

    applyRowReplacements([
      { previousRow: { value: 'first' }, row: firstRow, write: firstWrite },
      { previousRow: { value: 'second' }, row: secondRow, write: secondWrite },
    ]);

    expect(firstWrite).toHaveBeenCalledOnce();
    expect(firstWrite).toHaveBeenCalledWith(firstRow);
    expect(secondWrite).toHaveBeenCalledOnce();
    expect(secondWrite).toHaveBeenCalledWith(secondRow);
  });

  it('restores earlier rows when a later synchronous replacement fails', () => {
    const writes: string[] = [];
    const failure = new Error('Replacement failed.');

    expect(() => {
      applyRowReplacements<TestRow>([
        {
          previousRow: { value: 'first' },
          row: { value: 'first-updated' },
          write: (row) => {
            writes.push(row.value);
          },
        },
        {
          previousRow: { value: 'second' },
          row: { value: 'second-updated' },
          write: () => {
            throw failure;
          },
        },
      ]);
    }).toThrow(failure);

    expect(writes).toEqual(['first-updated', 'first']);
  });
});
