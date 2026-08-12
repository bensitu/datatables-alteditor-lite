import { EditorTargetUnavailableError } from '../core/alt-editor-lite-error.js';
import {
  resolveLogicalCellTarget,
  type LogicalCellTarget,
} from '../core/editing/commit-row-update.js';
import { isColumnVisiblyAvailable } from '../datatables/column-visibility.js';
import { resolveUniqueRowIndexById } from '../datatables/row-id-resolution.js';
import { EditorAlertDialog } from '../dialog/editor-alert-dialog.js';

import {
  focusInlineCellOrTable,
  restoreInlineOriginFocus,
} from './inline-focus-owner.js';
import { InlineFocusStateMachine } from './inline-focus-state-machine.js';

import type { InlineColumnMapping } from './inline-column-mapping.js';
import type { InlineEditSession } from './inline-edit-session.js';
import type { InlineTargetSummary } from './inline-edit-state.js';
import type { InlineFocusRestoreToken } from './inline-focus-state.js';
import type { InlineNavigationIntent } from './inline-navigation.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { ResolvedInlineEditingOptions } from '../core/resolve-editing-options.js';
import type { Api } from 'datatables.net';

export interface InlineFocusCoordinatorArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly enabled: boolean;
  readonly instanceId: string;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>;
  readonly options: Readonly<ResolvedInlineEditingOptions<TFormValues>>;
  readonly table: Api<TRow>;
  readonly tableElement: HTMLTableElement;
}

/** Owns inline alert focus, blur state, and post-commit focus recovery. */
export class InlineFocusCoordinator<TRow extends object, TFormValues extends object> {
  private readonly alertDialog: EditorAlertDialog | undefined;

  private readonly stateMachine = new InlineFocusStateMachine();

  private activeAlertToken: InlineFocusRestoreToken | undefined;

  private nextAlertId = 0;

  public constructor(
    private readonly arguments_: InlineFocusCoordinatorArguments<TRow, TFormValues>,
  ) {
    this.alertDialog = arguments_.enabled
      ? new EditorAlertDialog(
          arguments_.tableElement,
          `${arguments_.instanceId}-inline`,
          arguments_.language,
        )
      : undefined;
  }

  public sessionMounted(): void {
    this.stateMachine.transition({ type: 'session-mounted' });
  }

  public validationStarted(): void {
    this.stateMachine.transition({ type: 'validation-started' });
  }

  public submissionStarted(): void {
    this.stateMachine.transition({ type: 'submission-started' });
  }

  public operationReturnedToEditing(): void {
    if (
      this.stateMachine.current() === 'validating' ||
      this.stateMachine.current() === 'submitting'
    ) {
      this.stateMachine.transition({ type: 'operation-returned-to-editing' });
    }
  }

  public shouldApplyBlurAction(): boolean {
    return this.stateMachine.shouldApplyBlurAction();
  }

  /** Presents a modal summary and restores the active inline control. */
  public async showAlert(
    session: InlineEditSession<TRow, TFormValues>,
    error: AltEditorLiteError,
    kind: 'validation' | 'operation',
    isCurrentSession: () => boolean,
    isDestroyed: () => boolean,
  ): Promise<void> {
    if (isDestroyed() || !isCurrentSession()) {
      return;
    }
    const alertDialog = this.alertDialog;
    if (alertDialog === undefined) {
      return;
    }
    if (!['editing', 'validating', 'submitting'].includes(this.stateMachine.current())) {
      return;
    }

    this.stateMachine.transition({ type: 'alert-requested' });
    const token = Object.freeze({
      alertId: (this.nextAlertId += 1),
      sessionId: session.sessionId,
    });
    this.activeAlertToken = token;
    const fieldMessage = error.fieldErrors?.[session.capture.field.name];
    const unrelatedMessages = Object.entries(error.fieldErrors ?? {})
      .filter(([fieldName]) => fieldName !== session.capture.field.name)
      .map(([, message]) => message);
    const message =
      unrelatedMessages.length > 0
        ? [error.message, ...unrelatedMessages].join(' ')
        : (fieldMessage ?? error.message);
    let alertPromise: Promise<void>;
    try {
      alertPromise = alertDialog.open({
        message,
        title:
          kind === 'validation'
            ? this.arguments_.language.alert.validationTitle
            : this.arguments_.language.alert.operationTitle,
      });
    } catch (error: unknown) {
      this.activeAlertToken = undefined;
      if (isCurrentSession() && this.stateMachine.current() === 'alert-opening') {
        this.stateMachine.transition({ type: 'alert-open-failed' });
        session.host.focus();
      }
      throw error;
    }
    this.stateMachine.transition({ type: 'alert-opened' });
    await alertPromise;

    if (
      isDestroyed() ||
      !isCurrentSession() ||
      this.activeAlertToken !== token ||
      this.stateMachine.current() !== 'alert-open'
    ) {
      return;
    }
    this.stateMachine.transition({ type: 'alert-close-requested' });
    this.stateMachine.transition({ type: 'focus-restore-started' });
    const canRestore =
      session.host.element.isConnected &&
      session.host.element.closest('table') === this.arguments_.tableElement;
    if (canRestore) {
      session.host.focus();
    } else {
      focusInlineCellOrTable(
        this.arguments_.table,
        this.arguments_.tableElement,
        undefined,
      );
    }
    this.stateMachine.transition({
      type: canRestore ? 'focus-restored' : 'focus-restore-failed',
    });
    this.activeAlertToken = undefined;
  }

  /** Restores navigation or committed-cell focus after session cleanup. */
  public async restoreAfterCommit(
    session: InlineEditSession<TRow, TFormValues>,
    navigationIntent: InlineNavigationIntent | undefined,
    focusTarget: Readonly<LogicalCellTarget<TRow>> | undefined,
    openSession: (rowIndex: number, columnIndex: number) => Promise<void>,
  ): Promise<void> {
    if (navigationIntent !== undefined) {
      try {
        const navigationRowIndex =
          navigationIntent.rowId === undefined
            ? navigationIntent.rowIndex
            : resolveUniqueRowIndexById(this.arguments_.table, navigationIntent.rowId);
        if (navigationRowIndex === undefined) {
          throw new EditorTargetUnavailableError(
            this.arguments_.language.inline.targetUnavailable,
          );
        }
        await openSession(navigationRowIndex, navigationIntent.columnIndex);
        return;
      } catch {
        // The committed cell or table receives focus below.
      }
    }

    let cellNode: HTMLTableCellElement | undefined;
    try {
      if (this.arguments_.options.updateMode === 'refresh') {
        cellNode = this.resolveRefreshCell(session.capture.summary);
      } else if (focusTarget !== undefined) {
        cellNode = resolveLogicalCellTarget(
          this.arguments_.table,
          focusTarget,
          this.arguments_.language.inline.targetUnavailable,
        );
      }
    } catch {
      cellNode = undefined;
    }
    focusInlineCellOrTable(this.arguments_.table, this.arguments_.tableElement, cellNode);
  }

  /** Begins the single session teardown sequence and closes active alerts. */
  public beginCleanup(): void {
    if (
      this.stateMachine.current() !== 'cleanup' &&
      this.stateMachine.current() !== 'destroyed'
    ) {
      this.stateMachine.transition({ type: 'cleanup-started' });
    }
    this.activeAlertToken = undefined;
    this.alertDialog?.close();
  }

  /** Completes focus bookkeeping after owned session DOM is removed. */
  public completeCleanup(): void {
    if (this.stateMachine.current() === 'cleanup') {
      this.stateMachine.transition({ type: 'cleanup-complete' });
    }
  }

  /** Restores the element focused before inline activation when still available. */
  public restoreOrigin(session: InlineEditSession<TRow, TFormValues>): void {
    restoreInlineOriginFocus(session.host.element, session.originalActiveElement);
  }

  /** Removes the alert dialog and permanently closes focus coordination. */
  public destroy(): void {
    this.activeAlertToken = undefined;
    this.alertDialog?.destroy();
    this.stateMachine.transition({ type: 'destroyed' });
  }

  private resolveRefreshCell(
    summary: Readonly<InlineTargetSummary>,
  ): HTMLTableCellElement {
    if (summary.rowId === undefined) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const rowIndexById = resolveUniqueRowIndexById(this.arguments_.table, summary.rowId);
    if (rowIndexById === undefined) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const row = this.arguments_.table.row(rowIndexById);
    const rowIndex = row.index();
    const column = this.arguments_.table.column(summary.columnIndex);
    if (
      !row.any() ||
      typeof rowIndex !== 'number' ||
      (summary.columnName !== undefined && column.name() !== summary.columnName) ||
      !isColumnVisiblyAvailable(column) ||
      this.arguments_.mappings.get(summary.columnIndex)?.fieldName !== summary.fieldName
    ) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    const cellNode = this.arguments_.table.cell(rowIndex, summary.columnIndex).node();
    if (!(cellNode instanceof HTMLTableCellElement) || !cellNode.isConnected) {
      throw new EditorTargetUnavailableError(
        this.arguments_.language.inline.targetUnavailable,
      );
    }
    return cellNode;
  }
}
