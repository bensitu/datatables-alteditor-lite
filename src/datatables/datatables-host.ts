import { EditorTargetUnavailableError } from '../core/alt-editor-lite-error.js';
import { InlineColumnMappingRegistry } from '../inline/inline-column-mapping-registry.js';
import { InlineEditController } from '../inline/inline-edit-controller.js';
import { createInlineEditPresentation } from '../inline/inline-edit-presentation.js';
import { createInlineNavigationIntent } from '../inline/inline-navigation.js';
import { captureInlineTarget } from '../inline/inline-target-capture.js';
import { resolveInlineTarget } from '../inline/inline-target-resolution.js';
import { validateInlineConfiguration } from '../inline/validate-inline-configuration.js';

import { isColumnVisiblyAvailable } from './column-visibility.js';
import { resolveLogicalCellTarget } from './commit-inline-update.js';
import { DataTablesRecordHost } from './datatables-record-host.js';
import { resolveUniqueRowIndexById } from './row-id-resolution.js';

import type { FieldConfig } from '../contracts/field-config.js';
import type { AltEditorLite } from '../editor/alt-editor-lite.js';
import type {
  InlineHostRuntime,
  InlineHostRuntimeArguments,
  InlineHostRuntimeFactory,
} from '../host/inline-host-runtime.js';
import type { InlineColumnMapping } from '../inline/inline-column-mapping.js';
import type { InlineTargetSummary } from '../inline/inline-edit-state.js';
import type { InlineNavigationIntent } from '../inline/inline-navigation.js';
import type { InlineTargetCapture } from '../inline/inline-target-capture.js';
import type { LogicalCellTarget } from './commit-inline-update.js';
import type { DataTablesRecordTarget } from './datatables-record-targets.js';
import type { ColumnSelector, RowSelector } from 'datatables.net';

export type { DataTablesRecordTarget } from './datatables-record-targets.js';

declare const dataTablesInlineTargetBrand: unique symbol;

/** Opaque cell identity accepted by the neutral inline editor method. */
export interface DataTablesInlineTarget {
  readonly [dataTablesInlineTargetBrand]: true;
}

interface InlineSelectorPair<TRow extends object> {
  readonly row: RowSelector<TRow>;
  readonly column: ColumnSelector;
}

function hasCellFocusMethod(value: unknown): value is { focus(): unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'focus' in value &&
    typeof value.focus === 'function'
  );
}

/** DataTables record host with support for inline cell editing. */
export class DataTablesHost<TRow extends object>
  extends DataTablesRecordHost<TRow>
  implements InlineHostRuntimeFactory<TRow, DataTablesRecordTarget>
{
  readonly #inlineSelectors = new WeakMap<
    DataTablesInlineTarget,
    InlineSelectorPair<TRow>
  >();

  /** Creates an opaque inline target from DataTables selectors. */
  public createInlineTarget(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
  ): DataTablesInlineTarget {
    const target = Object.freeze({}) as DataTablesInlineTarget;
    this.#inlineSelectors.set(target, { column: columnSelector, row: rowSelector });
    return target;
  }

  /** Creates the DataTables-owned inline editing runtime. */
  public createInlineRuntime<TFormValues extends object>(
    runtime: InlineHostRuntimeArguments<TRow, TFormValues, DataTablesRecordTarget>,
  ): InlineHostRuntime {
    validateInlineConfiguration(this.table, runtime.editorOptions, runtime.editing);
    const mappingRegistry = new InlineColumnMappingRegistry(
      this.table,
      runtime.fields,
      runtime.editing.inline,
    );
    const presentation = createInlineEditPresentation<TRow, TFormValues>(
      runtime.editing.inline.activation,
      runtime.editing.inline,
      runtime.language,
    );
    const controller = new InlineEditController({
      host: this,
      enabled: runtime.enabled,
      editOperationRunner: runtime.editOperationRunner,
      editor: runtime.editor as AltEditorLite<TRow, TFormValues>,
      editorOptions: runtime.editorOptions,
      fields: runtime.fields,
      instanceId: runtime.instanceId,
      interactionCoordinator: runtime.interactionCoordinator,
      language: runtime.language,
      mappingRegistry,
      notifyIntegration: runtime.notifyIntegration,
      operationOwner: runtime.operationOwner,
      options: runtime.editing.inline,
      presentation,
      reportError: runtime.reportError,
      table: this.table,
      tableElement: this.eventTarget,
      validateUnique: (values, rowCapture) =>
        runtime.validateUnique(values, this.records.store(rowCapture)),
    });

    return {
      allowsExternalOperation: () => controller.allowsExternalOperation(),
      cancel: () => controller.cancel(),
      destroy: () => {
        controller.destroy();
      },
      getState: () => controller.getState(),
      isEditing: () => controller.isEditing(),
      open: (target) => {
        const selectors =
          typeof target === 'object' && target !== null
            ? this.#inlineSelectors.get(target as DataTablesInlineTarget)
            : undefined;
        if (selectors === undefined) {
          return Promise.reject(
            new EditorTargetUnavailableError(
              'The inline target was not created by this DataTables host.',
            ),
          );
        }
        return controller.open(selectors.row, selectors.column);
      },
      prepareForExternalOperation: () => controller.prepareForExternalOperation(),
      submit: () => controller.submit(),
    };
  }

  /** Captures one eligible DataTables cell for inline editing. */
  public captureInlineTarget<TFormValues extends object>(
    rowSelector: RowSelector<TRow>,
    columnSelector: ColumnSelector,
    fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): InlineTargetCapture<TRow, TFormValues> {
    return captureInlineTarget(
      this.table,
      this.eventTarget,
      rowSelector,
      columnSelector,
      fieldsByName,
      mappings,
      unavailableMessage,
    );
  }

  /** Revalidates an inline row, field mapping, and rendered cell identity. */
  public resolveInlineTarget<TFormValues extends object>(
    capture: InlineTargetCapture<TRow, TFormValues>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): number {
    return resolveInlineTarget(
      this.table,
      this.eventTarget,
      capture,
      mappings,
      unavailableMessage,
    );
  }

  /** Resolves the next eligible inline cell on the current page. */
  public createInlineNavigationIntent<TFormValues extends object>(
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    fieldsByName: ReadonlyMap<string, Readonly<FieldConfig<TFormValues>>>,
    currentTarget: Readonly<InlineTargetSummary>,
    direction: 'forward' | 'backward',
  ): Readonly<InlineNavigationIntent> | undefined {
    return createInlineNavigationIntent(
      this.table,
      mappings,
      fieldsByName,
      currentTarget,
      direction,
    );
  }

  /** Resolves a navigation row after a presentation update. */
  public resolveInlineNavigationRow(
    intent: Readonly<InlineNavigationIntent>,
    unavailableMessage: string,
  ): number {
    if (intent.rowId === undefined) {
      return intent.rowIndex;
    }
    const rowIndex = resolveUniqueRowIndexById(this.table, intent.rowId);
    if (rowIndex === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    return rowIndex;
  }

  /** Resolves the cell associated with a completed inline commit. */
  public resolveInlineCommitCell(
    target: Readonly<LogicalCellTarget<TRow>>,
    unavailableMessage: string,
  ): HTMLTableCellElement {
    return resolveLogicalCellTarget(this.table, target, unavailableMessage);
  }

  /** Resolves a stable cell after a consumer-owned refresh. */
  public resolveInlineRefreshCell<TFormValues extends object>(
    summary: Readonly<InlineTargetSummary>,
    mappings: ReadonlyMap<number, Readonly<InlineColumnMapping<TFormValues>>>,
    unavailableMessage: string,
  ): HTMLTableCellElement {
    if (summary.rowId === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const rowIndexById = resolveUniqueRowIndexById(this.table, summary.rowId);
    if (rowIndexById === undefined) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const row = this.table.row(rowIndexById);
    const rowIndex = row.index();
    const column = this.table.column(summary.columnIndex);
    if (
      !row.any() ||
      typeof rowIndex !== 'number' ||
      (summary.columnName !== undefined && column.name() !== summary.columnName) ||
      !isColumnVisiblyAvailable(column) ||
      mappings.get(summary.columnIndex)?.fieldName !== summary.fieldName
    ) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    const cellNode = this.table.cell(rowIndex, summary.columnIndex).node();
    if (!(cellNode instanceof HTMLTableCellElement) || !cellNode.isConnected) {
      throw new EditorTargetUnavailableError(unavailableMessage);
    }
    return cellNode;
  }

  /** Restores focus to a logical cell with the owned table as a fallback. */
  public focusInlineCell(cellNode: HTMLTableCellElement | undefined): void {
    if (
      cellNode?.isConnected === true &&
      cellNode.closest('table') === this.eventTarget
    ) {
      const cellApi = this.table.cell(cellNode);
      if (hasCellFocusMethod(cellApi)) {
        cellApi.focus();
        return;
      }
      this.#focusElement(cellNode);
      return;
    }
    this.#focusElement(this.eventTarget);
  }

  #focusElement(element: HTMLElement): void {
    const existingTabIndex = element.getAttribute('tabindex');
    const didAddTemporaryTabIndex = element.tabIndex < 0 && existingTabIndex === null;
    if (didAddTemporaryTabIndex) {
      element.setAttribute('tabindex', '-1');
    }
    try {
      element.focus();
    } finally {
      if (didAddTemporaryTabIndex) {
        element.removeAttribute('tabindex');
      }
    }
  }
}
