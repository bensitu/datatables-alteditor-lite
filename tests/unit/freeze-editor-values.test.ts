import { describe, expect, it } from 'vitest';

import { freezeEditorValues } from '../../src/core/freeze-editor-values.js';
import { buildInlineValues } from '../../src/inline/inline-values.js';

describe('freezeEditorValues', () => {
  it('freezes cyclic plain values without revisiting them', () => {
    const values: { self?: unknown; values: unknown[] } = { values: [] };
    values.self = values;
    values.values.push(values);

    expect(() => freezeEditorValues(values)).not.toThrow();
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(values.values)).toBe(true);
  });

  it('freezes array values included in an inline edit transaction', () => {
    interface FormValues {
      attachments: File[];
      name: string;
    }

    const attachments = [new File(['content'], 'notes.txt')];
    const values = buildInlineValues<FormValues>(
      [
        { label: 'Name', name: 'name', type: 'text' },
        {
          label: 'Attachments',
          multiple: true,
          name: 'attachments',
          type: 'file',
        },
      ],
      { attachments, name: 'Before' },
      'name',
      'After',
    );

    expect(values).toMatchObject({ attachments, name: 'After' });
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(attachments)).toBe(true);
    expect(Object.isFrozen(attachments[0])).toBe(false);
  });
});
