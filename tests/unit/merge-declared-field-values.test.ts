import { describe, expect, it } from 'vitest';

import { mergeDeclaredFieldValues } from '../../src/core/merge-declared-field-values.js';

interface MergeRow {
  readonly id: string;
  readonly profile: {
    readonly email: string;
    readonly name: string;
  };
  readonly untouched: {
    readonly marker: string;
  };
}

interface MergeValues {
  readonly id?: string;
  readonly profile?: {
    readonly email?: string;
    readonly name?: string;
  };
  readonly undeclared?: string;
}

describe('declared field merge', () => {
  it('updates only collected declared paths and preserves immutable branches', () => {
    const original: MergeRow = {
      id: 'row-a',
      profile: {
        email: 'before@example.test',
        name: 'Before',
      },
      untouched: { marker: 'same-reference' },
    };
    const result = mergeDeclaredFieldValues<MergeRow, MergeValues>(
      original,
      {
        profile: { email: 'after@example.test' },
        undeclared: 'must-not-merge',
      },
      ['profile.email', 'profile.name', 'id'],
    );

    expect(result).toEqual({
      id: 'row-a',
      profile: {
        email: 'after@example.test',
        name: 'Before',
      },
      untouched: { marker: 'same-reference' },
    });
    expect(result).not.toBe(original);
    expect(result.profile).not.toBe(original.profile);
    expect(result.untouched).toBe(original.untouched);
    expect(original.profile.email).toBe('before@example.test');
    expect('undeclared' in result).toBe(false);
  });

  it('creates new plain branches instead of traversing unsafe source values', () => {
    const original = {
      id: 'row-a',
      profile: new Date('2026-01-01T00:00:00.000Z'),
    };
    const result = mergeDeclaredFieldValues<
      typeof original,
      { readonly profile?: { readonly email?: string } }
    >(original, { profile: { email: 'safe@example.test' } }, ['profile.email']);

    expect(result.profile).toEqual({ email: 'safe@example.test' });
    expect(Object.getPrototypeOf(result.profile)).toBe(Object.prototype);
    expect(original.profile).toBeInstanceOf(Date);
  });

  it('applies an explicitly collected clear without clearing omitted fields', () => {
    const original: MergeRow = {
      id: 'row-a',
      profile: {
        email: 'before@example.test',
        name: 'Before',
      },
      untouched: { marker: 'same-reference' },
    };
    const result = mergeDeclaredFieldValues<MergeRow, MergeValues>(
      original,
      {},
      ['profile.email', 'profile.name'],
      new Map([['profile.name', undefined]]),
    );

    expect(result.profile).toEqual({
      email: 'before@example.test',
      name: undefined,
    });
    expect(result.untouched).toBe(original.untouched);
  });

  it('replaces scalar, null, and array branches and accepts null-prototype records', () => {
    const nullPrototypeProfile = Object.assign(Object.create(null) as object, {
      preserved: 'value',
    });
    const sourceProfiles: readonly unknown[] = ['scalar', null, [], nullPrototypeProfile];

    for (const profile of sourceProfiles) {
      const original = { profile };
      const result = mergeDeclaredFieldValues<
        typeof original,
        { readonly profile?: { readonly email?: string } }
      >(original, { profile: { email: 'safe@example.test' } }, ['profile.email']);

      expect(result.profile).toEqual({
        ...(profile === nullPrototypeProfile ? { preserved: 'value' } : {}),
        email: 'safe@example.test',
      });
      expect(Object.getPrototypeOf(result.profile)).toBe(Object.prototype);
    }
  });

  it('rejects prototype-related declared paths', () => {
    expect(() =>
      mergeDeclaredFieldValues({ id: 'row-a' }, { safe: 'value' }, [
        '__proto__.polluted',
      ]),
    ).toThrow('Invalid field path');
    expect(Object.hasOwn({}, 'polluted')).toBe(false);
  });
});
