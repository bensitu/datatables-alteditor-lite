import { describe, expect, it, vi } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { BatchEditOperationRunner } from '../../src/core/editing/batch-edit-operation-runner.js';
import { OperationOwner } from '../../src/core/editing/operation-owner.js';

import type {
  ClientSideOperations,
  EditorErrorHookContext,
  EditorOperations,
} from '../../src/core/alt-editor-lite-options.js';
import type { BatchEditValidationResult } from '../../src/core/editing/batch-edit-transaction.js';
import type { OwnedOperationRequest } from '../../src/core/editing/operation-owner.js';

interface TestRow {
  readonly id: string;
  readonly name: string;
  readonly profile: { readonly city: string };
}

interface TestValues {
  readonly name: string;
  readonly profile: { readonly city: string };
}

type CommitCallback = (
  rows: readonly TestRow[],
  request: OwnedOperationRequest<'batchEdit'>,
) => Promise<void>;

type ReportErrorCallback = (
  error: AltEditorLiteError,
  context: EditorErrorHookContext,
  publishEvent: boolean,
) => void;

const originals: readonly Readonly<TestRow>[] = Object.freeze([
  Object.freeze({ id: 'a', name: 'Alice', profile: { city: 'Tokyo' } }),
  Object.freeze({ id: 'b', name: 'Bob', profile: { city: 'Osaka' } }),
]);

const operationTargets = Object.freeze([
  Object.freeze({ fieldNames: ['name'], key: 'a' }),
  Object.freeze({ fieldNames: ['name'], key: 'b' }),
]);

function validChanges(): Readonly<BatchEditValidationResult<TestValues>> {
  return {
    changedFields: ['name'],
    changes: { name: 'Updated' },
    collectedFieldValues: new Map([['name', 'Updated']]),
    valid: true,
  };
}

function createPresentation(
  validation: Readonly<BatchEditValidationResult<TestValues>> = validChanges(),
) {
  return {
    completeSuccess: vi.fn(() => Promise.resolve()),
    completeUnchanged: vi.fn(() => Promise.resolve()),
    restoreAfterOperationFailure: vi.fn(),
    restoreAfterValidationFailure: vi.fn(),
    setBusy: vi.fn(),
    showOperationError: vi.fn(),
    startValidation: vi.fn(),
    validate: vi.fn(() => Promise.resolve(validation)),
  };
}

function createRunArguments(presentation: ReturnType<typeof createPresentation>) {
  return {
    commit: vi.fn<CommitCallback>(() => Promise.resolve()),
    dispatchSubmit: vi.fn(),
    dispatchSuccess: vi.fn(),
    originals,
    presentation,
    recordTargets: ['a', 'b'] as const,
    reportError: vi.fn<ReportErrorCallback>(),
    revalidateTargets: vi.fn(),
    targets: operationTargets,
  };
}

describe('batch edit operation runner', () => {
  it('persists one ordered change set before committing canonical rows', async () => {
    const lifecycle: string[] = [];
    const canonicalRows = originals.map((row) => ({ ...row, name: 'Updated' }));
    const updateMany = vi.fn<
      NonNullable<EditorOperations<TestRow, TestValues>['updateMany']>
    >((changes, rows, context) => {
      lifecycle.push('persist');
      expect(changes).toEqual({ name: 'Updated' });
      expect(rows).toEqual(originals);
      expect(context).toMatchObject({ mode: 'dialog', operation: 'batchEdit' });
      expect(context.targets).toEqual(operationTargets);
      return canonicalRows;
    });
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);
    runArguments.dispatchSubmit.mockImplementation(() => {
      lifecycle.push('submit');
    });
    runArguments.commit.mockImplementation(() => {
      lifecycle.push('commit');
      return Promise.resolve();
    });
    runArguments.dispatchSuccess.mockImplementation(() => {
      lifecycle.push('success');
    });

    const result = await runner.run({
      ...runArguments,
      afterSuccess: (context) => {
        lifecycle.push('after-success');
        expect(context).toMatchObject({
          changes: { name: 'Updated' },
          operation: 'batchEdit',
          originals,
        });
        return Promise.resolve();
      },
      beforeSubmit: (_transaction, context) => {
        lifecycle.push('before-submit');
        expect(context.originals).toEqual(originals);
        return Promise.resolve(true);
      },
    });

    expect(result.status).toBe('success');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(runArguments.commit).toHaveBeenCalledWith(canonicalRows, expect.any(Object));
    expect(runArguments.revalidateTargets).toHaveBeenCalledTimes(3);
    expect(lifecycle).toEqual([
      'before-submit',
      'submit',
      'persist',
      'commit',
      'success',
      'after-success',
    ]);
  });

  it('leaves commit untouched when remote persistence rejects', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany: () => Promise.reject(new Error('Request failed.')) },
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.commit).not.toHaveBeenCalled();
    expect(runArguments.dispatchSuccess).not.toHaveBeenCalled();
    expect(presentation.showOperationError).toHaveBeenCalledOnce();
  });

  it('reports a Host application failure after persistence completes', async () => {
    const updateMany = vi.fn(() => originals.map((row) => ({ ...row, name: 'Updated' })));
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);
    runArguments.commit.mockRejectedValue(new Error('Host application failed.'));

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(updateMany).toHaveBeenCalledOnce();
    const reportedError = runArguments.reportError.mock.calls[0]?.[0];
    expect(runArguments.reportError).toHaveBeenCalledWith(
      reportedError,
      expect.objectContaining({ committed: true, phase: 'commit' }),
      true,
    );
  });

  it('reports target loss after persistence as committed', async () => {
    const updateMany = vi.fn(() => originals.map((row) => ({ ...row, name: 'Updated' })));
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);
    runArguments.revalidateTargets
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Target unavailable.'));

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(updateMany).toHaveBeenCalledOnce();
    expect(runArguments.commit).not.toHaveBeenCalled();
    const reportedError = runArguments.reportError.mock.calls[0]?.[0];
    expect(runArguments.reportError).toHaveBeenCalledWith(
      reportedError,
      expect.objectContaining({ committed: true, phase: 'persistence' }),
      true,
    );
  });

  it('reports a presentation failure together with the persistence failure', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany: () => Promise.reject(new Error('Request failed.')) },
      undefined,
    );
    const presentation = createPresentation();
    presentation.showOperationError.mockImplementation(() => {
      throw new Error('Unable to display the error.');
    });
    const runArguments = createRunArguments(presentation);

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.reportError).toHaveBeenCalledTimes(2);
    expect(runArguments.reportError.mock.calls.map((call) => call[2])).toEqual([
      false,
      true,
    ]);
    expect(presentation.restoreAfterOperationFailure).toHaveBeenCalledOnce();
  });

  it('rejects a canonical row count mismatch before commit', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany: () => [originals[0] as TestRow] },
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.commit).not.toHaveBeenCalled();
    const reportedError = runArguments.reportError.mock.calls[0]?.[0];
    expect(runArguments.reportError).toHaveBeenCalledWith(
      reportedError,
      expect.objectContaining({ committed: true, phase: 'persistence' }),
      true,
    );
  });

  it('rejects a non-array remote result before commit', async () => {
    const updateMany = vi.fn(
      () => ({ first: originals[0], second: originals[1] }) as unknown as TestRow[],
    );
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.commit).not.toHaveBeenCalled();
  });

  it('rejects an invalid canonical row before commit', async () => {
    const updateMany = vi.fn(() => [originals[0], null] as unknown as TestRow[]);
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.commit).not.toHaveBeenCalled();
  });

  it('does not fan out a single-record remote update operation', async () => {
    const update = vi.fn<NonNullable<EditorOperations<TestRow, TestValues>['update']>>(
      (_values, original) => original,
    );
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { update },
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(update).not.toHaveBeenCalled();
    expect(runArguments.commit).not.toHaveBeenCalled();
  });

  it('builds each client-side row from its original and the shared changes', async () => {
    const updateRow = vi.fn<
      NonNullable<ClientSideOperations<TestRow, TestValues>['updateRow']>
    >((original, changes) => ({
      ...original,
      name: changes.name ?? original.name,
    }));
    const clientSide: ClientSideOperations<TestRow, TestValues> = { updateRow };
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      clientSide,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('success');
    expect(updateRow).toHaveBeenNthCalledWith(1, originals[0], { name: 'Updated' });
    expect(updateRow).toHaveBeenNthCalledWith(2, originals[1], { name: 'Updated' });
    expect(runArguments.commit.mock.calls[0]?.[0]).toEqual([
      { ...originals[0], name: 'Updated' },
      { ...originals[1], name: 'Updated' },
    ]);
  });

  it('uses declared field paths for client-side canonical rows', async () => {
    const validation: Readonly<BatchEditValidationResult<TestValues>> = {
      changedFields: ['profile.city'],
      changes: { profile: { city: 'Seoul' } },
      collectedFieldValues: new Map([['profile.city', 'Seoul']]),
      valid: true,
    };
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const runArguments = createRunArguments(createPresentation(validation));

    const result = await runner.run(runArguments);

    expect(result.status).toBe('success');
    expect(runArguments.commit.mock.calls[0]?.[0]).toEqual([
      { ...originals[0], profile: { city: 'Seoul' } },
      { ...originals[1], profile: { city: 'Seoul' } },
    ]);
  });

  it('completes an unchanged submission without persistence or commit', async () => {
    const updateMany =
      vi.fn<NonNullable<EditorOperations<TestRow, TestValues>['updateMany']>>();
    const validation: Readonly<BatchEditValidationResult<TestValues>> = {
      changedFields: [],
      changes: {},
      collectedFieldValues: new Map(),
      valid: true,
    };
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const presentation = createPresentation(validation);
    const runArguments = createRunArguments(presentation);

    const result = await runner.run(runArguments);

    expect(result.status).toBe('unchanged');
    expect(updateMany).not.toHaveBeenCalled();
    expect(runArguments.commit).not.toHaveBeenCalled();
    expect(runArguments.dispatchSuccess).not.toHaveBeenCalled();
    expect(presentation.completeUnchanged).toHaveBeenCalledOnce();
  });

  it('restores the form after validation rejects the shared changes', async () => {
    const error = new AltEditorLiteError({
      code: 'VALIDATION',
      message: 'The shared changes are invalid.',
      retryable: true,
    });
    const validation: Readonly<BatchEditValidationResult<TestValues>> = {
      error,
      valid: false,
    };
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation(validation);
    const runArguments = createRunArguments(presentation);

    const result = await runner.run(runArguments);

    expect(result).toEqual({ error, status: 'validation-failed' });
    expect(presentation.restoreAfterValidationFailure).toHaveBeenCalledOnce();
    expect(runArguments.dispatchSubmit).not.toHaveBeenCalled();
  });

  it('honors an asynchronous submission veto before persistence', async () => {
    const updateMany = vi.fn(() => originals);
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);

    const result = await runner.run({
      ...runArguments,
      beforeSubmit: () => Promise.resolve(false),
    });

    expect(result.status).toBe('vetoed');
    expect(updateMany).not.toHaveBeenCalled();
    expect(presentation.restoreAfterValidationFailure).toHaveBeenCalledOnce();
  });

  it('keeps a committed update successful when the success hook rejects', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run({
      ...runArguments,
      afterSuccess: () => Promise.reject(new Error('Notification failed.')),
    });

    expect(result.status).toBe('success');
    expect(runArguments.commit).toHaveBeenCalledOnce();
    const reportedError = runArguments.reportError.mock.calls[0]?.[0];
    expect(reportedError?.message).toBe(ENGLISH_LANGUAGE.errors.generic);
    expect(reportedError?.cause).toMatchObject({ message: 'Notification failed.' });
    expect(runArguments.reportError).toHaveBeenCalledWith(
      reportedError,
      expect.objectContaining({ committed: true, phase: 'afterSuccess' }),
      false,
    );
  });

  it('keeps a committed update successful when presentation completion rejects', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation();
    presentation.completeSuccess.mockRejectedValue(new Error('Completion failed.'));
    const runArguments = createRunArguments(presentation);

    const result = await runner.run(runArguments);

    expect(result.status).toBe('success');
    expect(presentation.showOperationError).not.toHaveBeenCalled();
    const reportedError = runArguments.reportError.mock.calls[0]?.[0];
    expect(reportedError?.cause).toMatchObject({ message: 'Completion failed.' });
    expect(runArguments.reportError).toHaveBeenCalledWith(
      reportedError,
      expect.objectContaining({ committed: true, phase: 'afterSuccess' }),
      false,
    );
  });

  it('rejects asynchronous client-side row mapping before commit', async () => {
    const updateRow = vi.fn(() =>
      Promise.resolve(originals[0]),
    ) as unknown as NonNullable<ClientSideOperations<TestRow, TestValues>['updateRow']>;
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      { updateRow },
    );
    const runArguments = createRunArguments(createPresentation());

    const result = await runner.run(runArguments);

    expect(result.status).toBe('failed');
    expect(runArguments.commit).not.toHaveBeenCalled();
  });

  it('suppresses a late persistence result after cancellation', async () => {
    let resolveUpdate: ((rows: readonly TestRow[]) => void) | undefined;
    const updateMany = vi.fn<
      NonNullable<EditorOperations<TestRow, TestValues>['updateMany']>
    >(
      () =>
        new Promise<readonly TestRow[]>((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const operationOwner = new OperationOwner();
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      operationOwner,
      ENGLISH_LANGUAGE,
      { updateMany },
      undefined,
    );
    const runArguments = createRunArguments(createPresentation());
    const submission = runner.run(runArguments);
    await vi.waitFor(() => {
      expect(updateMany).toHaveBeenCalledOnce();
    });

    operationOwner.invalidate();
    resolveUpdate?.(originals);

    await expect(submission).resolves.toEqual({ status: 'aborted' });
    expect(runArguments.commit).not.toHaveBeenCalled();
  });

  it.each([
    'validation',
    'before-submit',
    'submit-event',
    'commit',
    'success-event',
    'completion',
  ] as const)('suppresses continuation after cancellation during %s', async (point) => {
    const operationOwner = new OperationOwner();
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      operationOwner,
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = createRunArguments(presentation);
    if (point === 'validation') {
      presentation.validate.mockImplementation(() => {
        operationOwner.invalidate();
        return Promise.resolve(validChanges());
      });
    }
    if (point === 'submit-event') {
      runArguments.dispatchSubmit.mockImplementation(() => {
        operationOwner.invalidate();
      });
    }
    if (point === 'commit') {
      runArguments.commit.mockImplementation(() => {
        operationOwner.invalidate();
        return Promise.resolve();
      });
    }
    if (point === 'success-event') {
      runArguments.dispatchSuccess.mockImplementation(() => {
        operationOwner.invalidate();
      });
    }
    if (point === 'completion') {
      presentation.completeSuccess.mockImplementation(() => {
        operationOwner.invalidate();
        return Promise.resolve();
      });
    }

    const result = await runner.run({
      ...runArguments,
      ...(point === 'before-submit'
        ? {
            beforeSubmit: () => {
              operationOwner.invalidate();
              return Promise.resolve(true);
            },
          }
        : {}),
    });

    expect(result).toEqual({ status: 'aborted' });
    expect(runArguments.reportError).not.toHaveBeenCalled();
  });

  it('rejects duplicate record targets before validation', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = {
      ...createRunArguments(presentation),
      recordTargets: ['a', 'a'] as const,
    };

    await expect(runner.run(runArguments)).rejects.toThrow(
      'Batch Edit targets must be distinct.',
    );
    expect(presentation.startValidation).not.toHaveBeenCalled();
  });

  it('requires at least two record targets before validation', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation();
    const firstOriginal = originals[0];
    const firstOperationTarget = operationTargets[0];
    if (firstOriginal === undefined || firstOperationTarget === undefined) {
      throw new Error('Expected one batch edit fixture target.');
    }
    const runArguments = {
      ...createRunArguments(presentation),
      originals: [firstOriginal],
      recordTargets: ['a'] as const,
      targets: [firstOperationTarget],
    };

    await expect(runner.run(runArguments)).rejects.toMatchObject({
      actualCount: 1,
      expected: 'at-least-two',
    });
    expect(presentation.startValidation).not.toHaveBeenCalled();
  });

  it('requires matching target and original row counts before validation', async () => {
    const runner = new BatchEditOperationRunner<TestRow, TestValues>(
      new OperationOwner(),
      ENGLISH_LANGUAGE,
      undefined,
      undefined,
    );
    const presentation = createPresentation();
    const runArguments = {
      ...createRunArguments(presentation),
      originals: [originals[0] as TestRow],
    };

    await expect(runner.run(runArguments)).rejects.toThrow('must have matching lengths');
    expect(presentation.startValidation).not.toHaveBeenCalled();
  });
});
