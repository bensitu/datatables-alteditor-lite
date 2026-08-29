import { describe, expect, it, vi } from 'vitest';

import { mergeAbortSignals } from '../../src/core/merge-abort-signals.js';

describe('merged abort signals', () => {
  it('follows an already aborted source', () => {
    const abortController = new AbortController();
    abortController.abort('cancelled');

    const { signal } = mergeAbortSignals([
      new AbortController().signal,
      abortController.signal,
    ]);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('cancelled');
  });

  it('follows the first source that aborts', () => {
    const first = new AbortController();
    const second = new AbortController();
    const { signal } = mergeAbortSignals([first.signal, second.signal]);

    second.abort('second');
    first.abort('first');

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe('second');
  });

  it('registers duplicate sources once and releases listeners on completion', () => {
    const source = new AbortController();
    const addEventListener = vi.spyOn(source.signal, 'addEventListener');
    const removeEventListener = vi.spyOn(source.signal, 'removeEventListener');
    const merged = mergeAbortSignals([source.signal, source.signal]);

    expect(addEventListener).toHaveBeenCalledTimes(1);

    merged.dispose();
    merged.dispose();

    expect(removeEventListener).toHaveBeenCalledTimes(1);
    expect(merged.signal.aborted).toBe(false);
  });
});
