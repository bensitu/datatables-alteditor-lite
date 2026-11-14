import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createInstanceId } from '../../src/instance/create-instance-id.js';

const instanceSequenceKey = Symbol.for('datatables-alteditor-lite.instance-sequence.v1');
let originalDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, instanceSequenceKey);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalDescriptor === undefined) {
    Reflect.deleteProperty(globalThis, instanceSequenceKey);
  } else {
    Object.defineProperty(globalThis, instanceSequenceKey, originalDescriptor);
  }
});

describe('editor instance identifiers', () => {
  it('continues a realm-wide sequence shared through the global symbol registry', () => {
    Object.defineProperty(globalThis, instanceSequenceKey, {
      configurable: true,
      value: 41,
      writable: true,
    });

    expect(createInstanceId()).toBe('alteditor-lite-42');
    expect(createInstanceId()).toBe('alteditor-lite-43');
    expect(Reflect.get(globalThis, instanceSequenceKey)).toBe(43);
  });

  it('creates distinct identifiers across modules when the shared sequence cannot be written', async () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.25).mockReturnValueOnce(0.5);
    Object.defineProperty(globalThis, instanceSequenceKey, {
      configurable: true,
      get: () => 9,
      set: () => {
        throw new TypeError('The shared sequence is read-only.');
      },
    });

    const firstId = createInstanceId();
    vi.resetModules();
    const separateModule = await import('../../src/instance/create-instance-id.js');
    const secondId = separateModule.createInstanceId();

    expect(firstId).toMatch(/^alteditor-lite-/u);
    expect(secondId).toMatch(/^alteditor-lite-/u);
    expect(secondId).not.toBe(firstId);
    expect(Reflect.get(globalThis, instanceSequenceKey)).toBe(9);
  });
});
