import type { InlineTargetSummary } from './inline-edit-state.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';

/** Converts an inline target summary to public event metadata. */
export function createInlineEventTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<EditorOperationTarget> {
  return createInlineOperationTarget(summary);
}

/** Converts an inline target summary to shared operation metadata. */
export function createInlineOperationTarget(
  summary: Readonly<InlineTargetSummary>,
): Readonly<EditorOperationTarget> {
  return Object.freeze({
    fieldNames: summary.fieldNames,
    key: summary.key,
  });
}
