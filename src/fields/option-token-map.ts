import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { SelectOption } from './field-config.js';

function optionIdentity(value: string | number): string {
  if (typeof value === 'string') {
    return `string:${value}`;
  }

  return `number:${Object.is(value, -0) ? '-0' : String(value)}`;
}

/**
 * Rejects duplicate values while preserving the distinction between strings and numbers.
 *
 * @param options - Typed option definitions.
 */
export function assertUniqueOptionValues<TValue extends string | number>(
  options: readonly SelectOption<TValue>[],
): void {
  const optionIdentitySet = new Set<string>();

  for (const option of options) {
    const identity = optionIdentity(option.value);
    if (optionIdentitySet.has(identity)) {
      throw new EditorConfigurationError('Option values must be unique by type.');
    }
    optionIdentitySet.add(identity);
  }
}

/**
 * Maps DOM-safe option tokens back to original string or number values.
 */
export class OptionTokenMap<TValue extends string | number> {
  private readonly optionByToken = new Map<string, SelectOption<TValue>>();

  private readonly tokenByOptionIdentity = new Map<string, string>();

  /**
   * Creates stable tokens in source option order.
   *
   * @param options - Typed consumer options.
   */
  public constructor(options: readonly SelectOption<TValue>[]) {
    assertUniqueOptionValues(options);

    for (const [optionIndex, option] of options.entries()) {
      const token = `option-${String(optionIndex)}`;
      this.optionByToken.set(token, option);
      this.tokenByOptionIdentity.set(optionIdentity(option.value), token);
    }
  }

  /**
   * Returns source options paired with their DOM tokens.
   *
   * @returns Stable token-option pairs.
   */
  public entries(): readonly (readonly [string, SelectOption<TValue>])[] {
    return [...this.optionByToken.entries()];
  }

  /**
   * Resolves a DOM token to its original typed value.
   *
   * @param token - DOM option value.
   * @returns Original value, or undefined for an unknown or clear token.
   */
  public valueForToken(token: string): TValue | undefined {
    return this.optionByToken.get(token)?.value;
  }

  /**
   * Resolves a DOM token to its complete option.
   *
   * @param token - DOM option token.
   * @returns Original option, or undefined for an unknown token.
   */
  public optionForToken(token: string): SelectOption<TValue> | undefined {
    return this.optionByToken.get(token);
  }

  /**
   * Resolves a typed value to its DOM token.
   *
   * @param value - Original string or number value.
   * @returns Matching token, or undefined when no option matches.
   */
  public tokenForValue(value: TValue): string | undefined {
    return this.tokenByOptionIdentity.get(optionIdentity(value));
  }
}
