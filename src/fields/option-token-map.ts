import type { SelectOption } from './field-config.js';

/**
 * Maps DOM-safe option tokens back to original string or number values.
 */
export class OptionTokenMap<TValue extends string | number> {
  private readonly optionByToken = new Map<string, SelectOption<TValue>>();

  /**
   * Creates stable tokens in source option order.
   *
   * @param options - Typed consumer options.
   */
  public constructor(options: readonly SelectOption<TValue>[]) {
    for (const [optionIndex, option] of options.entries()) {
      this.optionByToken.set(`option-${String(optionIndex)}`, option);
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
   * Resolves a typed value to its DOM token.
   *
   * @param value - Original string or number value.
   * @returns Matching token, or undefined when no option matches.
   */
  public tokenForValue(value: TValue): string | undefined {
    for (const [token, option] of this.optionByToken) {
      if (Object.is(option.value, value)) {
        return token;
      }
    }

    return undefined;
  }
}
