import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';

import type { SelectOption } from './field-config.js';

function optionIdentity(value: string | number): string {
  return typeof value === 'string'
    ? `string:${value}`
    : `number:${Object.is(value, -0) ? '-0' : String(value)}`;
}

function validateOptions<TValue extends string | number>(
  options: readonly SelectOption<TValue>[],
): void {
  const identities = new Set<string>();
  for (const option of options) {
    if (
      (typeof option.value !== 'string' && typeof option.value !== 'number') ||
      typeof option.label !== 'string' ||
      (option.disabled !== undefined && typeof option.disabled !== 'boolean')
    ) {
      throw new EditorConfigurationError(
        'Choice options require a string or number value, a string label, and an optional boolean disabled state.',
      );
    }
    const identity = optionIdentity(option.value);
    if (identities.has(identity)) {
      throw new EditorConfigurationError('Option values must be unique by type.');
    }
    identities.add(identity);
  }
}

/** Stores validated choice options and their DOM-safe typed-value tokens. */
export class ChoiceOptionStore<TValue extends string | number> {
  private optionSnapshot: readonly Readonly<SelectOption<TValue>>[] = [];

  private optionByToken = new Map<string, Readonly<SelectOption<TValue>>>();

  private tokenByOptionIdentity = new Map<string, string>();

  public constructor(options: readonly SelectOption<TValue>[]) {
    this.replace(options);
  }

  /** Returns the current immutable option snapshot. */
  public options(): readonly Readonly<SelectOption<TValue>>[] {
    return this.optionSnapshot;
  }

  /** Replaces all options after validating the complete candidate list. */
  public replace(options: readonly SelectOption<TValue>[]): void {
    validateOptions(options);
    const snapshot = Object.freeze(options.map((option) => Object.freeze({ ...option })));
    const optionByToken = new Map<string, Readonly<SelectOption<TValue>>>();
    const tokenByOptionIdentity = new Map<string, string>();
    for (const [optionIndex, option] of snapshot.entries()) {
      const token = `option-${String(optionIndex)}`;
      optionByToken.set(token, option);
      tokenByOptionIdentity.set(optionIdentity(option.value), token);
    }
    this.optionSnapshot = snapshot;
    this.optionByToken = optionByToken;
    this.tokenByOptionIdentity = tokenByOptionIdentity;
  }

  /** Returns current source-order token and option pairs. */
  public entries(): readonly (readonly [string, Readonly<SelectOption<TValue>>])[] {
    return [...this.optionByToken.entries()];
  }

  public valueForToken(token: string): TValue | undefined {
    return this.optionByToken.get(token)?.value;
  }

  public optionForToken(token: string): Readonly<SelectOption<TValue>> | undefined {
    return this.optionByToken.get(token);
  }

  public tokenForValue(value: TValue): string | undefined {
    return this.tokenByOptionIdentity.get(optionIdentity(value));
  }
}
