import { describe, expect, it } from 'vitest';

import { freezeEditorValues } from '../../src/core/freeze-editor-values.js';
import { buildInlineValues } from '../../src/inline/inline-values.js';

describe('freezeEditorValues', () => {
  it('freezes cyclic plain values without revisiting them', () => {
    const values: { self?: unknown; values: unknown[] } = { values: [] };
    values.self = values;
    values.values.push(values);

    const snapshot = freezeEditorValues<typeof values>(values);
    expect(snapshot).not.toBe(values);
    expect(snapshot.self).toBe(snapshot);
    expect(snapshot.values?.[0]).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.values)).toBe(true);
    expect(Object.isFrozen(values)).toBe(false);
    values.values.push('Later');
    expect(snapshot.values).toHaveLength(1);
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
    expect(Object.isFrozen(values.attachments)).toBe(true);
    expect(values.attachments).not.toBe(attachments);
    expect(values.attachments?.[0]).toBe(attachments[0]);
    expect(Object.isFrozen(attachments)).toBe(false);
    expect(Object.isFrozen(attachments[0])).toBe(false);
  });
});
