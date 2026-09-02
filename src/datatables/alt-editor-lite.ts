import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { AltEditorLite as CoreAltEditorLite } from '../core/alt-editor-lite.js';

import { DataTablesHost } from './datatables-host.js';

import type {
  DataTablesInlineTarget,
  DataTablesRecordTarget,
} from './datatables-host.js';
import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { DeepPartial } from '../core/editor-values.js';
import type { InlineEditState } from '../inline/inline-edit-state.js';
import type { Api, ColumnSelector, RowSelector } from 'datatables.net';

/** DataTables-specific editor configuration. */
export interface DataTablesAltEditorLiteOptions<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> extends AltEditorLiteOptions<TRow, TFormValues> {
  /** Maximum wait for an Ajax refresh callback, in milliseconds. */
  readonly refreshTimeout?: number;
}

/** DataTables-specific convenience facade over the neutral editor runtime. */
export class AltEditorLite<
  TRow extends object,
  TFormValues extends object = DeepPartial<TRow>,
> extends CoreAltEditorLite<TRow, TFormValues, DataTablesRecordTarget> {
  public readonly dataTablesHost: DataTablesHost<TRow>;

  public constructor(
    table: Api<TRow>,
    options: DataTablesAltEditorLiteOptions<TRow, TFormValues>,
  ) {
    const host = new DataTablesHost(table, options.refreshTimeout);
    try {
      super(host, options);
    } catch (error: unknown) {
      try {
        host.destroy();
      } catch {
        // Continue returning the editor construction failure.
      }
      throw error;
    }
    this.dataTablesHost = host;
  }

  public override openEditDialog(
    target?: DataTablesRecordTarget | RowSelector<TRow>,
  ): Promise<void> {
    if (target === undefined || this.dataTablesHost.ownsRecordTarget(target)) {
      return super.openEditDialog(target);
    }
    return super.openEditDialog(this.dataTablesHost.resolveRecordTarget(target));
  }

  public override openBatchEditDialog(
    targets?: readonly DataTablesRecordTarget[],
  ): Promise<void>;
  public override openBatchEditDialog(targets: RowSelector<TRow>): Promise<void>;
  public override openBatchEditDialog(
    targets?: readonly DataTablesRecordTarget[] | RowSelector<TRow>,
  ): Promise<void> {
    if (targets === undefined) {
      return super.openBatchEditDialog();
    }
    if (
      Array.isArray(targets) &&
      targets.every((target) => this.dataTablesHost.ownsRecordTarget(target))
    ) {
      return super.openBatchEditDialog(targets);
    }
    if (
      Array.isArray(targets) &&
      targets.some((target) => this.dataTablesHost.ownsRecordTarget(target))
    ) {
      return Promise.reject(
        new EditorConfigurationError(
          'Batch Edit targets must not mix DataTables selectors with record targets.',
        ),
      );
    }
    return super.openBatchEditDialog(
      this.dataTablesHost.resolveRecordTargets(targets as RowSelector<TRow>),
    );
  }

  public override openRemoveDialog(
    targets?: readonly DataTablesRecordTarget[] | RowSelector<TRow>,
  ): Promise<void> {
    if (targets === undefined) {
      return super.openRemoveDialog();
    }
    if (
      Array.isArray(targets) &&
      targets.every((target) => this.dataTablesHost.ownsRecordTarget(target))
    ) {
      return super.openRemoveDialog(targets);
    }
    if (
      Array.isArray(targets) &&
      targets.some((target) => this.dataTablesHost.ownsRecordTarget(target))
    ) {
      return Promise.reject(
        new EditorConfigurationError(
          'Remove targets must not mix DataTables selectors with record targets.',
        ),
      );
    }
    return super.openRemoveDialog(
      this.dataTablesHost.resolveRecordTargets(targets as RowSelector<TRow>),
    );
  }

  public override openInlineEdit(target: DataTablesInlineTarget): Promise<void>;
  public override openInlineEdit(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): Promise<void>;
  public override openInlineEdit(
    target: DataTablesInlineTarget | RowSelector<TRow>,
    columnSelector?: ColumnSelector,
  ): Promise<void> {
    return super.openInlineEdit(
      columnSelector === undefined
        ? target
        : this.dataTablesHost.createInlineTarget(
            target as RowSelector<TRow>,
            columnSelector,
          ),
    );
  }

  /** Returns DataTables-specific inline target details. */
  public override getInlineState(): Readonly<InlineEditState> {
    return super.getInlineState() as Readonly<InlineEditState>;
  }
}
