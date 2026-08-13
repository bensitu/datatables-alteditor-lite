import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createInstanceId } from '../../src/instance/create-instance-id.js';

const instanceSequenceKey = Symbol.for('datatables-alteditor-lite.instance-sequence.v1');
let originalDescriptor: PropertyDescriptor | undefined;

beforeEach(() => {
  originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, instanceSequenceKey);
});

afterEach(() => {
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
});
