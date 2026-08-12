import {
  commitRowUpdateWithFocus,
  type LogicalCellTarget,
} from '../core/editing/commit-row-update.js';
import { dispatchEditorEvent } from '../core/editor-event.js';

import {
  createInlineEventTarget,
  createInlineOperationTarget,
} from './inline-operation-target.js';
import { resolveInlineTarget } from './inline-target-resolution.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineEditSession } from './inline-edit-session.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { DrawOwnership } from '../core/editing/draw-ownership.js';
import type {
  EditOperationResult,
  EditOperationRunner,
} from '../core/editing/edit-operation-runner.js';
import type { EditPresentationAdapter } from '../core/editing/edit-presentation-adapter.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';
import type { Api } from 'datatables.net';

export interface InlineCommitCoordinatorArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly editor: AltEditorLite<TRow, TFormValues>;
  readonly table: Api<TRow>;
  readonly tableElement: HTMLTableElement;
  readonly mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>;
  readonly options: Readonly<ResolvedInlineEditingOptions<TFormValues>>;
  readonly editorOptions: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly operationOwner: OperationOwner;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly drawOwnership: DrawOwnership<TRow>;
  readonly targetUnavailableMessage: string;
  readonly reportError: (
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ) => void;
}

/** Owns inline Edit persistence, commit mode, and lifecycle event wiring. */
export class InlineCommitCoordinator<TRow extends object, TFormValues extends object> {
  public constructor(
    private readonly arguments_: InlineCommitCoordinatorArguments<TRow, TFormValues>,
  ) {}

  /** Runs one shared Edit transaction and hands off its logical focus target. */
  public async run(
    session: InlineEditSession<TRow, TFormValues>,
    presentation: EditPresentationAdapter<TRow, TFormValues>,
    handOffFocusTarget: (target: Readonly<LogicalCellTarget<TRow>>) => void,
  ): Promise<EditOperationResult<TRow>> {
    const {
      drawOwnership,
      editor,
      editorOptions,
      editOperationRunner,
      mappings,
      operationOwner,
      options,
      table,
      tableElement,
      targetUnavailableMessage,
    } = this.arguments_;
    const target = createInlineOperationTarget(session.capture.summary);
    const result = await editOperationRunner.run({
      ...(editorOptions.hooks?.afterSuccess === undefined
        ? {}
        : {
            afterSuccess: async (context) => {
              await Promise.resolve(editorOptions.hooks?.afterSuccess?.(context));
            },
          }),
      ...(editorOptions.hooks?.beforeSubmit === undefined
        ? {}
        : {
            beforeSubmit: async (transaction, context) => {
              const shouldContinue = await Promise.resolve(
                editorOptions.hooks?.beforeSubmit?.(transaction.values, {
                  ...context,
                  original: transaction.original,
                }),
              );
              return shouldContinue !== false;
            },
          }),
      commit: async (row, rowIndex, request) => {
        if (options.updateMode === 'refresh') {
          await drawOwnership.runWhile(
            'refresh',
            request.abortController.signal,
            async () => {
              await Promise.resolve(
                editorOptions.operations?.refresh?.(
                  operationOwner.context(table, request, 'refresh'),
                ),
              );
            },
          );
          return Object.freeze({ row });
        }

        const commitResult = await commitRowUpdateWithFocus(
          table,
          rowIndex,
          row,
          session.capture.column.columnIndex,
          session.capture.column.columnName,
          drawOwnership,
          request.abortController.signal,
        );
        handOffFocusTarget(commitResult.focusTarget);
        return commitResult;
      },
      dispatchSubmit: (transaction) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:submit'>(
          tableElement,
          'alteditor-lite:submit',
          {
            editor,
            mode: 'inline',
            operation: 'edit',
            original: transaction.original,
            target: createInlineEventTarget(session.capture.summary),
            type: 'submit',
            values: transaction.values,
          },
        );
      },
      dispatchSuccess: (transaction, commitResult) => {
        dispatchEditorEvent<TRow, TFormValues, 'alteditor-lite:success'>(
          tableElement,
          'alteditor-lite:success',
          {
            editor,
            mode: 'inline',
            operation: 'edit',
            original: transaction.original,
            row: commitResult.row,
            target: createInlineEventTarget(session.capture.summary),
            type: 'success',
            values: transaction.values,
          },
        );
      },
      mode: 'inline',
      original: session.capture.rowCapture.snapshot.original,
      presentation,
      reportError: this.arguments_.reportError,
      revalidateTarget: () =>
        resolveInlineTarget(
          table,
          tableElement,
          session.capture,
          mappings,
          targetUnavailableMessage,
        ),
      target,
    });

    return result;
  }
}
