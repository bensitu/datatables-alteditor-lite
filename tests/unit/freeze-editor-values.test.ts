import { describe, expect, it } from 'vitest';

import { freezeEditorValues } from '../../src/core/freeze-editor-values.js';

describe('freezeEditorValues', () => {
  it('freezes cyclic plain values without revisiting them', () => {
    const values: { self?: unknown; values: unknown[] } = { values: [] };
    values.self = values;
    values.values.push(values);

    expect(() => freezeEditorValues(values)).not.toThrow();
    expect(Object.isFrozen(values)).toBe(true);
    expect(Object.isFrozen(values.values)).toBe(true);
  });
});
