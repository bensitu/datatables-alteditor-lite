import { describe, expect, it } from 'vitest';

import { RequestSequence } from '../../src/core/request-sequence.js';

describe('request sequence', () => {
  it('owns only the latest request identity', () => {
    const sequence = new RequestSequence();
    const firstRequest = sequence.next();
    const secondRequest = sequence.next();

    expect(sequence.isCurrent(firstRequest)).toBe(false);
    expect(sequence.isCurrent(secondRequest)).toBe(true);
    sequence.invalidate();
    expect(sequence.isCurrent(secondRequest)).toBe(false);
  });
});
