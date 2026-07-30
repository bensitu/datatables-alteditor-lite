import { describe, expect, it } from 'vitest';

import { EditorFileLimitError } from '../../src/core/alt-editor-lite-error.js';
import { validateFileBudget } from '../../src/fields/file-budget.js';
import { normalizeNumberValue } from '../../src/fields/number-value.js';
import { OptionTokenMap } from '../../src/fields/option-token-map.js';
import { readFileAsDataUrl } from '../../src/fields/read-file-data-url.js';

const fileMessages = {
  fileCount: 'Too many files.',
  fileSize: 'File too large.',
};

describe('field value normalization', () => {
  it('normalizes number values without returning an empty string', () => {
    expect(normalizeNumberValue('', undefined)).toEqual({
      valid: true,
      value: undefined,
    });
    expect(normalizeNumberValue('', null)).toEqual({
      valid: true,
      value: null,
    });
    expect(normalizeNumberValue('12.5', undefined)).toEqual({
      valid: true,
      value: 12.5,
    });
    expect(normalizeNumberValue('not-a-number', undefined)).toEqual({
      valid: false,
    });
  });

  it('round-trips typed select tokens without string coercion', () => {
    const tokenMap = new OptionTokenMap<string | number>([
      { label: 'Numeric', value: 1 },
      { label: 'String', value: '1' },
    ]);

    expect(tokenMap.valueForToken('option-0')).toBe(1);
    expect(tokenMap.valueForToken('option-1')).toBe('1');
    expect(tokenMap.valueForToken('missing')).toBeUndefined();
    expect(tokenMap.tokenForValue(1)).toBe('option-0');
    expect(tokenMap.tokenForValue('1')).toBe('option-1');
    expect(tokenMap.tokenForValue(2)).toBeUndefined();
  });

  it('checks file count and byte budgets before reading', () => {
    const smallFile = new File(['small'], 'small.txt');
    const largeFile = new File(['too large'], 'large.txt');

    expect(() => {
      validateFileBudget([smallFile], { maxFileBytes: 5, maxFileCount: 1 }, fileMessages);
    }).not.toThrow();
    expect(() => {
      validateFileBudget([smallFile, smallFile], { maxFileCount: 1 }, fileMessages);
    }).toThrow(new EditorFileLimitError('Too many files.'));
    expect(() => {
      validateFileBudget([largeFile], { maxFileBytes: 5 }, fileMessages);
    }).toThrow(new EditorFileLimitError('File too large.'));
  });

  it('reads a data URL and honors an already-aborted signal', async () => {
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    const dataUrl = await readFileAsDataUrl(file, new AbortController().signal);
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/u);

    const abortController = new AbortController();
    abortController.abort();
    await expect(readFileAsDataUrl(file, abortController.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });

    const activeAbortController = new AbortController();
    const abortedRead = readFileAsDataUrl(file, activeAbortController.signal);
    activeAbortController.abort();
    await expect(abortedRead).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});
