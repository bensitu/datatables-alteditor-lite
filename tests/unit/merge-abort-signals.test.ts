import { describe, expect, it } from 'vitest';

import { mergeAbortSignals } from '../../src/core/merge-abort-signals.js';

describe('merged abort signals', () => {
  it('follows an already aborted source', () => {
    const abortController = new AbortController();
    abortController.abort('cancelled');

    const signal = mergeAbortSignals([
      new AbortController().signal,
      abortController.signal,
    ]);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('cancelled');
  });

  it('follows the first source that aborts', () => {
    const first = new AbortController();
    const second = new AbortController();
    const signal = mergeAbortSignals([first.signal, second.signal]);

    second.abort('second');
    first.abort('first');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('second');
  });
});
