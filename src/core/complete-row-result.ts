import { EditorConfigurationError } from './alt-editor-lite-error.js';
import { hasOwn } from './has-own.js';

import type { RowValidation } from './alt-editor-lite-options.js';

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function assertCompleteRow(
  rowCandidate: unknown,
  callbackName: string,
): asserts rowCandidate is object {
  if (
    typeof rowCandidate !== 'object' ||
    rowCandidate === null ||
    Array.isArray(rowCandidate)
  ) {
    throw new EditorConfigurationError(
      `${callbackName} must return a complete row object.`,
    );
  }
}

type ReadId<TRow extends object> = (row: Readonly<TRow>) => unknown;

export function requireRowId(value: unknown): string | number {
  if (
    (typeof value === 'string' && value.length > 0) ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  throw new EditorConfigurationError(
    'A stable row ID is required. Configure rowValidation.getId.',
  );
}

/** Validates canonical rows against their application schema and original identity. */
export class CanonicalRows<TRow extends object> {
  public constructor(
    private readonly options?: RowValidation<TRow>,
    private readonly hostId?: ReadId<TRow>,
  ) {}

  public identity(original: Readonly<TRow>): ReadId<TRow> {
    if (this.options?.getId !== undefined) return this.options.getId;
    if (this.hostId?.(original) !== undefined) return this.hostId;
    return (row) => (hasOwn(row, 'id') ? Reflect.get(row, 'id') : undefined);
  }

  public check(candidate: unknown, source: string, original?: Readonly<TRow>): TRow {
    assertCompleteRow(candidate, source);
    const row = candidate as TRow;
    const isValid =
      this.options?.validate === undefined
        ? original === undefined ||
          Reflect.ownKeys(original).every((key) => hasOwn(row, key))
        : this.options.validate(row);
    if (!isValid)
      throw new EditorConfigurationError(`${source} must return a complete row object.`);
    if (this.options?.getId !== undefined) {
      if (original === undefined) requireRowId(this.options.getId(row));
      else {
        const hostId = this.hostId?.(original);
        if (hostId !== undefined && this.hostId?.(row) !== hostId) {
          throw new EditorConfigurationError(`${source} must retain the host row ID.`);
        }
      }
    }
    return row;
  }

  public replacement(
    original: Readonly<TRow>,
    requireIdentity: boolean,
  ): (candidate: unknown, source: string) => TRow {
    const readId = this.identity(original);
    const id = readId(original);
    if (requireIdentity || id !== undefined || this.options?.getId !== undefined)
      requireRowId(id);
    return (candidate, source) => {
      const row = this.check(candidate, source, original);
      if (id !== undefined && readId(row) !== id) {
        throw new EditorConfigurationError(`${source} must retain the original row ID.`);
      }
      return row;
    };
  }
}
