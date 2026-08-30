import { describe, expect, it, vi } from 'vitest';

import { AltEditorLiteError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { OperationOwner } from '../../src/core/editing/operation-owner.js';
import { DialogCreateOperation } from '../../src/dialog/dialog-create-operation.js';
import { DialogRemoveOperation } from '../../src/dialog/dialog-remove-operation.js';

import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../../src/core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../../src/core/alt-editor-lite.js';
import type { EditorErrorReporter } from '../../src/core/editor-error-reporter.js';
import type { EditorFormController } from '../../src/form/form-controller.js';
import type { EditorHost } from '../../src/host/editor-host.js';

interface TestRow {
  readonly id: string;
  readonly name: string;
}

interface TestValues {
  readonly name: string;
}

type ReportError = (
  error: AltEditorLiteError,
  context: EditorErrorHookContext,
  publishEvent: boolean,
) => void;

function createErrorReporter() {
  const report = vi.fn<ReportError>();
  const runAfterSuccess = vi.fn(() => Promise.resolve());
  return {
    errorReporter: { report, runAfterSuccess } as unknown as EditorErrorReporter<
      TestRow,
      TestValues
    >,
    report,
    runAfterSuccess,
  };
}

function createHost(): EditorHost<TestRow, string> {
  return {
    applyCreate: vi.fn(() => Promise.resolve('created')),
    applyRemove: vi.fn(() => Promise.resolve()),
    applyUpdate: vi.fn(() => Promise.resolve('updated')),
    destroy: vi.fn(),
    eventTarget: new EventTarget(),
    ownershipKey: {},
    read: vi.fn(() => ({ id: 'record-a', name: 'Alpha' })),
  };
}

function createForm(): EditorFormController<TestValues> {
  return {
    validateForSubmission: vi.fn(() =>
      Promise.resolve({
        fieldValues: new Map([['name', 'Created']]),
        valid: true as const,
        values: { name: 'Created' },
      }),
    ),
  } as unknown as EditorFormController<TestValues>;
}

describe('dialog operation recovery', () => {
  it('reports a Create presentation failure without hiding the persistence failure', async () => {
    const persistenceFailure = new AltEditorLiteError({
      code: 'CREATE_FAILED',
      message: 'Create failed.',
    });
    const presentationFailure = new Error('Unable to present the error.');
    const { errorReporter, report } = createErrorReporter();
    const operation = new DialogCreateOperation<TestRow, TestValues, string>({
      editor: {} as AltEditorLite<TestRow, TestValues>,
      errorReporter,
      eventTarget: new EventTarget(),
      host: createHost(),
      language: ENGLISH_LANGUAGE,
      onPresentationComplete: vi.fn(),
      operationOwner: new OperationOwner(),
      options: {
        fields: [],
        operations: { create: () => Promise.reject(persistenceFailure) },
      },
    });

    await operation.run(createForm(), {
      completeSuccess: vi.fn(),
      restoreAfterAbort: vi.fn(),
      restoreAfterValidation: vi.fn(),
      showOperationError: vi.fn(() => {
        throw presentationFailure;
      }),
      startSubmission: vi.fn(),
    });

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cause: presentationFailure }),
      expect.objectContaining({ committed: false, operation: 'create' }),
      false,
    );
    expect(report).toHaveBeenNthCalledWith(
      2,
      persistenceFailure,
      expect.objectContaining({ committed: false, operation: 'create' }),
      true,
    );
  });

  it('reports a Remove presentation failure without hiding the persistence failure', async () => {
    const persistenceFailure = new AltEditorLiteError({
      code: 'REMOVE_FAILED',
      message: 'Remove failed.',
    });
    const presentationFailure = new Error('Unable to present the error.');
    const { errorReporter, report } = createErrorReporter();
    const options: AltEditorLiteOptions<TestRow, TestValues> = {
      fields: [],
      operations: { remove: () => Promise.reject(persistenceFailure) },
    };
    const operation = new DialogRemoveOperation<TestRow, TestValues, string>({
      editor: {} as AltEditorLite<TestRow, TestValues>,
      errorReporter,
      eventTarget: new EventTarget(),
      host: createHost(),
      language: ENGLISH_LANGUAGE,
      onPresentationComplete: vi.fn(),
      operationOwner: new OperationOwner(),
      options,
    });

    await operation.run(['record-a'], [{ id: 'record-a', name: 'Alpha' }], {
      completeSuccess: vi.fn(),
      restoreAfterAbort: vi.fn(),
      showOperationError: vi.fn(() => {
        throw presentationFailure;
      }),
      startSubmission: vi.fn(),
    });

    expect(report).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ cause: presentationFailure }),
      expect.objectContaining({ committed: false, operation: 'remove' }),
      false,
    );
    expect(report).toHaveBeenNthCalledWith(
      2,
      persistenceFailure,
      expect.objectContaining({ committed: false, operation: 'remove' }),
      true,
    );
  });

  it('completes Host presentation synchronization after Create cleanup fails', async () => {
    const { errorReporter, report, runAfterSuccess } = createErrorReporter();
    const onPresentationComplete = vi.fn();
    const operation = new DialogCreateOperation<TestRow, TestValues, string>({
      editor: {} as AltEditorLite<TestRow, TestValues>,
      errorReporter,
      eventTarget: new EventTarget(),
      host: createHost(),
      language: ENGLISH_LANGUAGE,
      onPresentationComplete,
      operationOwner: new OperationOwner(),
      options: {
        fields: [],
        operations: {
          create: () => Promise.resolve({ id: 'created', name: 'Created' }),
        },
      },
    });

    await operation.run(createForm(), {
      completeSuccess: vi.fn(() => {
        throw new Error('Cleanup failed.');
      }),
      restoreAfterAbort: vi.fn(),
      restoreAfterValidation: vi.fn(),
      showOperationError: vi.fn(),
      startSubmission: vi.fn(),
    });

    expect(onPresentationComplete).toHaveBeenCalledOnce();
    expect(runAfterSuccess).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNKNOWN' }),
      expect.objectContaining({ committed: true, operation: 'create' }),
      false,
    );
    expect(report.mock.calls[0]?.[0].cause).toBeInstanceOf(Error);
  });
});
