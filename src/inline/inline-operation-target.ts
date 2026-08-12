import type { InlineTargetSummary } from './inline-edit-state.js';
import type { InlineEventTarget } from '../core/editor-event.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';

/** Converts an inline target summary to public event metadata. */
export function createInlineEventTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<InlineEventTarget> {
  return Object.freeze({ ...summary });
}

/** Converts an inline target summary to shared operation metadata. */
export function createInlineOperationTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<EditorOperationTarget> {
  return Object.freeze({
    columnIndex: summary.columnIndex,
    fieldNames: Object.freeze([summary.fieldName]),
    rowIndex: summary.rowIndex,
    ...(summary.rowId === undefined ? {} : { rowId: summary.rowId }),
    ...(summary.columnName === undefined ? {} : { columnName: summary.columnName }),
  });
}
