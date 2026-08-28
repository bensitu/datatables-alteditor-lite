import { dispatchEditorEvent } from '../core/editor-event.js';
import {
  commitRowUpdateWithFocus,
  type LogicalCellTarget,
} from '../datatables/commit-row-update.js';

import {
  createInlineEventTarget,
  createInlineOperationTarget,
} from './inline-operation-target.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineEditSession } from './inline-edit-session.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type {
  EditOperationResult,
  EditOperationRunner,
} from '../core/editing/edit-operation-runner.js';
import type { EditPresentationAdapter } from '../core/editing/edit-presentation-adapter.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';
import type { DataTablesHost } from '../datatables/data-tables-host.js';
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
  readonly host: DataTablesHost<TRow>;
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
      editor,
      editorOptions,
      editOperationRunner,
      host,
      mappings,
      operationOwner,
      options,
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
      commit: async (row, request) => {
        const rowIndex = host.resolveInlineTarget(
          session.capture,
          mappings,
          targetUnavailableMessage,
        );
        if (options.updateMode === 'refresh') {
          await host.refresh(request.abortController.signal, async () => {
            await Promise.resolve(
              editorOptions.operations?.refresh?.(
                operationOwner.context(request, 'refresh'),
              ),
            );
          });
          return Object.freeze({ row });
        }

        const commitResult = await commitRowUpdateWithFocus(
          host,
          rowIndex,
          row,
          session.capture.column.columnIndex,
          session.capture.column.columnName,
          request,
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
      revalidateTarget: () => {
        host.resolveInlineTarget(session.capture, mappings, targetUnavailableMessage);
      },
      target,
    });

    return result;
  }
}
