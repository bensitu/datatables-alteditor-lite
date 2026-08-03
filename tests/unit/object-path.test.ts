import { describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { parseFieldPath } from '../../src/object-path/field-path.js';
import { getPathValue, lookupPathValue } from '../../src/object-path/get-path-value.js';
import { setPathValue } from '../../src/object-path/set-path-value.js';

describe('safe object paths', () => {
  it('parses valid paths through the maximum supported depth', () => {
    expect(parseFieldPath('profile.contact.email')).toEqual([
      'profile',
      'contact',
      'email',
    ]);
    expect(parseFieldPath('a.b.c.d.e')).toHaveLength(5);
    expect(parseFieldPath('$root.child-name')).toEqual(['$root', 'child-name']);
  });

  it.each([
    '',
    'a.b.c.d.e.f',
    'items.0',
    'bad segment',
    '__proto__.polluted',
    'safe.prototype.value',
    'safe.constructor.value',
  ])('rejects the malformed or unsafe path %s', (fieldPath) => {
    expect(() => parseFieldPath(fieldPath)).toThrow(EditorConfigurationError);
  });

  it('reads only owned properties and stops at absent or scalar values', () => {
    const inheritedValues = { inherited: 'unsafe' };
    const values = Object.assign(Object.create(inheritedValues) as object, {
      profile: {
        contact: { email: 'person@example.test' },
        scalar: 4,
      },
    });

    expect(getPathValue(values, 'profile.contact.email')).toBe('person@example.test');
    expect(getPathValue(values, 'inherited')).toBeUndefined();
    expect(getPathValue(values, 'profile.missing')).toBeUndefined();
    expect(getPathValue(values, 'profile.scalar.value')).toBeUndefined();
    expect(getPathValue({ profile: null }, 'profile.value')).toBeUndefined();
  });

  it('distinguishes an explicit undefined value from an absent path', () => {
    const values = { profile: { name: undefined } };

    expect(lookupPathValue(values, 'profile.name')).toEqual({
      found: true,
      value: undefined,
    });
    expect(lookupPathValue(values, 'profile.missing')).toEqual({
      found: false,
      value: undefined,
    });
  });

  it('creates only plain objects and preserves existing plain records', () => {
    const values: Record<string, unknown> = {
      profile: { name: 'Before' },
    };

    setPathValue(values, 'profile.name', 'After');
    setPathValue(values, 'profile.contact.email', 'person@example.test');

    expect(values).toEqual({
      profile: {
        contact: { email: 'person@example.test' },
        name: 'After',
      },
    });
    expect(Object.getPrototypeOf(values['profile'] as object)).toBe(Object.prototype);
  });

  it('supports null-prototype intermediates but rejects other objects', () => {
    const nullPrototypeValues = Object.create(null) as Record<string, unknown>;
    nullPrototypeValues['safe'] = Object.create(null) as Record<string, unknown>;
    setPathValue(nullPrototypeValues, 'safe.value', 'ok');
    expect(getPathValue(nullPrototypeValues, 'safe.value')).toBe('ok');

    for (const unsafeIntermediate of [[], new Date(), null, 'scalar']) {
      const values: Record<string, unknown> = {
        nested: unsafeIntermediate,
      };
      expect(() => {
        setPathValue(values, 'nested.value', true);
      }).toThrow('Cannot traverse non-plain object');
    }
  });

  it('blocks real prototype-pollution attempts', () => {
    const target: Record<string, unknown> = {};

    for (const fieldPath of [
      '__proto__.polluted',
      'constructor.prototype.polluted',
      'safe.__proto__.polluted',
    ]) {
      expect(() => {
        setPathValue(target, fieldPath, true);
      }).toThrow(EditorConfigurationError);
    }

    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});
