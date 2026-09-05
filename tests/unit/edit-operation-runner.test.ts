import { describe, expect, it, vi } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { EditOperationRunner } from '../../src/core/editing/edit-operation-runner.js';
import { OperationOwner } from '../../src/core/editing/operation-owner.js';

describe('edit operation runner', () => {
  it.each(['invalid', 'vetoed'] as const)(
    'reports presentation failures when a submission is %s',
    async (outcome) => {
      const owner = new OperationOwner();
      const runner = new EditOperationRunner<{ name: string }, { name: string }>(
        owner,
        ENGLISH_LANGUAGE,
        undefined,
        undefined,
      );
      const failure = new Error('Presentation could not be restored.');
      const reportError = vi.fn();
      const commit = vi.fn(() => Promise.resolve({ row: { name: 'Updated' } }));
      const result = await runner.run({
        mode: 'dialog',
        original: { name: 'Original' },
        target: { key: 'record', fieldNames: ['name'] },
        beforeSubmit: () => Promise.resolve(false),
        commit,
        dispatchSubmit: vi.fn(),
        dispatchSuccess: vi.fn(),
        reportError,
        revalidateTarget: () => undefined,
        presentation: {
          startValidation: vi.fn(),
          setBusy: vi.fn(),
          showOperationError: vi.fn(),
          restoreAfterOperationFailure: vi.fn(),
          completeSuccess: vi.fn(),
          restoreAfterValidationFailure: () => {
            throw failure;
          },
          validate: () =>
            Promise.resolve(
              outcome === 'invalid'
                ? {
                    valid: false as const,
                    error: new AltEditorLiteError({ message: 'Invalid values.' }),
                  }
                : {
                    valid: true as const,
                    values: { name: 'Updated' },
                    changedFields: ['name' as const],
                    collectedFieldValues: new Map([['name', 'Updated']]),
                  },
            ),
        },
      });
      expect(result.status).toBe('failed');
      expect(reportError).toHaveBeenCalledWith(
        expect.objectContaining({ cause: failure }),
        expect.objectContaining({ committed: false }),
        true,
      );
      expect(commit).not.toHaveBeenCalled();
      owner.destroy();
    },
  );
});
