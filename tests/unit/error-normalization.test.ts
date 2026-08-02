import { describe, expect, it } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import {
  InternalOperationAbort,
  normalizeOperationError,
} from '../../src/core/error-normalization.js';

function activeSignal(): AbortSignal {
  return new AbortController().signal;
}

describe('operation error normalization', () => {
  it('preserves public editor errors exactly', () => {
    const error = new AltEditorLiteError({
      code: 'DOMAIN',
      fieldErrors: { name: 'Already used.' },
      message: 'Correct the form.',
      retryable: true,
    });

    expect(normalizeOperationError(error, activeSignal(), ENGLISH_LANGUAGE)).toBe(error);
  });

  it('normalizes an aborted signal and explicit AbortError internally', () => {
    const abortController = new AbortController();
    abortController.abort();
    const namedAbortError = new Error('consumer cancellation');
    namedAbortError.name = 'AbortError';

    expect(
      normalizeOperationError(
        new Error('ignored'),
        abortController.signal,
        ENGLISH_LANGUAGE,
      ),
    ).toBeInstanceOf(InternalOperationAbort);
    expect(
      normalizeOperationError(namedAbortError, activeSignal(), ENGLISH_LANGUAGE),
    ).toBeInstanceOf(InternalOperationAbort);
  });

  it('accepts only a fully validated own-property error shape', () => {
    const rawError = {
      code: 'CONFLICT',
      fieldErrors: {
        name: 'Already used.',
      },
      message: 'Resolve the conflict.',
      retryable: true,
    };
    const normalized = normalizeOperationError(
      rawError,
      activeSignal(),
      ENGLISH_LANGUAGE,
    );

    expect(normalized).toBeInstanceOf(AltEditorLiteError);
    expect(normalized).toMatchObject({
      cause: rawError,
      code: 'CONFLICT',
      fieldErrors: { name: 'Already used.' },
      message: 'Resolve the conflict.',
      retryable: true,
    });
  });

  it('supports the minimal operation error shape', () => {
    const rawError = { message: 'Operation refused.' };
    const normalized = normalizeOperationError(
      rawError,
      activeSignal(),
      ENGLISH_LANGUAGE,
    );

    expect(normalized).toMatchObject({
      cause: rawError,
      message: 'Operation refused.',
      retryable: false,
    });
  });

  it('accepts structured Error subclasses and bounds untrusted UI text', () => {
    class StructuredOperationError extends Error {
      public readonly code = 'REMOTE_VALIDATION';

      public readonly fieldErrors = { name: 'x'.repeat(1200) };

      public readonly retryable = true;
    }

    const rawError = new StructuredOperationError('x'.repeat(2200));
    const normalized = normalizeOperationError(
      rawError,
      activeSignal(),
      ENGLISH_LANGUAGE,
    );

    expect(normalized).toMatchObject({
      cause: rawError,
      code: 'REMOTE_VALIDATION',
      retryable: true,
    });
    if (!(normalized instanceof AltEditorLiteError)) {
      throw new Error('Expected a public normalized error.');
    }
    expect(normalized.message).toHaveLength(2000);
    expect(normalized.message.endsWith('…')).toBe(true);
    expect(normalized.fieldErrors?.['name']).toHaveLength(1000);
    expect(normalized.fieldErrors?.['name']?.endsWith('…')).toBe(true);
  });

  it.each([
    null,
    'raw secret',
    [],
    {},
    Object.create({ message: 'inherited secret' }) as object,
    { message: 42 },
    { code: 42, message: 'invalid code' },
    { message: 'invalid retry', retryable: 'yes' },
    { fieldErrors: null, message: 'invalid fields' },
    { fieldErrors: [], message: 'invalid fields' },
    { fieldErrors: { name: 42 }, message: 'invalid fields' },
  ])('uses the generic safe error for an invalid value', (rawError) => {
    const normalized = normalizeOperationError(
      rawError,
      activeSignal(),
      ENGLISH_LANGUAGE,
    );

    expect(normalized).toBeInstanceOf(AltEditorLiteError);
    expect(normalized).toMatchObject({
      cause: rawError,
      code: 'UNKNOWN',
      message: ENGLISH_LANGUAGE.errors.generic,
      retryable: false,
    });
  });

  it('hides ordinary Error and TypeError messages while retaining the cause', () => {
    const ordinaryError = new Error('server secret');
    const typeError = new TypeError('programming defect');

    for (const rawError of [ordinaryError, typeError]) {
      const normalized = normalizeOperationError(
        rawError,
        activeSignal(),
        ENGLISH_LANGUAGE,
      );
      if (!(normalized instanceof AltEditorLiteError)) {
        throw new Error('Expected a public normalized error.');
      }

      expect(normalized.message).toBe(ENGLISH_LANGUAGE.errors.generic);
      expect(normalized.cause).toBe(rawError);
      expect(normalized.message).not.toContain(rawError.message);
    }
  });

  it('uses the generic error when hostile values reject inspection', () => {
    const rawError = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('descriptor secret');
        },
        getPrototypeOf() {
          throw new Error('prototype secret');
        },
      },
    );
    const normalized = normalizeOperationError(
      rawError,
      activeSignal(),
      ENGLISH_LANGUAGE,
    );

    expect(normalized).toBeInstanceOf(AltEditorLiteError);
    expect(normalized).toMatchObject({
      code: 'UNKNOWN',
      message: ENGLISH_LANGUAGE.errors.generic,
      retryable: false,
    });
    if (!(normalized instanceof AltEditorLiteError)) {
      throw new Error('Expected a public normalized error.');
    }
    expect(normalized.cause === rawError).toBe(true);
  });
});
