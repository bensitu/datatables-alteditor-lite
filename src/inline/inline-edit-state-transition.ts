import { EditorOperationBusyError } from '../core/alt-editor-lite-error.js';

import type { InlineEditState } from './inline-edit-state.js';

const transitions: Readonly<Record<InlineEditState['status'], readonly string[]>> = {
  disabled: ['destroyed'],
  idle: ['activating', 'destroyed'],
  activating: ['editing', 'idle', 'destroyed'],
  editing: ['validating', 'idle', 'destroyed'],
  validating: ['editing', 'submitting', 'error', 'idle', 'destroyed'],
  submitting: ['idle', 'error', 'destroyed'],
  error: ['validating', 'editing', 'idle', 'destroyed'],
  destroyed: [],
};

/** Returns whether an inline lifecycle transition is explicitly supported. */
export function canTransitionInlineEditState(
  current: Readonly<InlineEditState>,
  next: Readonly<InlineEditState>,
): boolean {
  return transitions[current.status].includes(next.status);
}

/** Rejects a transition that could release or replace the wrong inline session. */
export function assertInlineEditStateTransition(
  current: Readonly<InlineEditState>,
  next: Readonly<InlineEditState>,
): void {
  if (!canTransitionInlineEditState(current, next)) {
    throw new EditorOperationBusyError();
  }
}
