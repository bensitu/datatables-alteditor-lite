import { describe, expect, it, vi } from 'vitest';

import { applyRowReplacements } from '../../src/datatables/apply-row-replacements.js';

interface TestRow {
  readonly value: string;
}

describe('DataTables row replacements', () => {
  it('restores independently writable nested records after a failed replacement', () => {
    const original = { nested: { value: 'original' }, tags: ['first'] };
    let record = original;
    const failure = new Error('Replacement failed.');
    expect(() => {
      applyRowReplacements([
        {
          previousRow: original,
          row: { nested: { value: 'updated' }, tags: ['second'] },
          write: (row) => {
            record = row;
            if (row.nested.value === 'updated') throw failure;
          },
        },
      ]);
    }).toThrow(failure);
    record.nested.value = 'editable';
    record.tags.push('third');
    expect(original).toEqual({ nested: { value: 'original' }, tags: ['first'] });
    expect(record).toEqual({ nested: { value: 'editable' }, tags: ['first', 'third'] });
  });

  it('restores detached values when a writer mutates a record before failing', () => {
    const records = [{ value: 'first' }, { value: 'second' }];
    const failure = new Error('Replacement failed.');

    expect(() => {
      applyRowReplacements<TestRow>(
        records.map((record, index) => ({
          previousRow: record,
          row: { value: 'updated' },
          write: (row) => {
            Object.assign(record, row);
            if (index === 1 && row.value === 'updated') throw failure;
          },
        })),
      );
    }).toThrow(failure);

    expect(records).toEqual([{ value: 'first' }, { value: 'second' }]);
  });

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
