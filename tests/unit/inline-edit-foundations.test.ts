import { describe, expect, it } from 'vitest';

import { EditorOperationBusyError } from '../../src/core/alt-editor-lite-error.js';
import { InteractionCoordinator } from '../../src/core/editing/interaction-coordinator.js';
import { OperationOwner } from '../../src/core/editing/operation-owner.js';
import {
  assertInlineEditStateTransition,
  canTransitionInlineEditState,
} from '../../src/inline/inline-edit-state-transition.js';

describe('inline interaction foundations', () => {
  it('does not allow a stale interaction token to release a newer owner', () => {
    const coordinator = new InteractionCoordinator();
    const first = coordinator.acquire('inline');
    coordinator.release(first);
    const second = coordinator.acquire('dialog');

    coordinator.release(first);

    expect(coordinator.current()).toBe('dialog');
    coordinator.release(second);
    expect(coordinator.current()).toBe('none');
  });

  it('rejects conflicting presentation ownership', () => {
    const coordinator = new InteractionCoordinator();
    coordinator.acquire('inline');

    expect(() => coordinator.acquire('refresh')).toThrow(EditorOperationBusyError);
  });

  it('invalidates late operation continuations when a new request begins', () => {
    const owner = new OperationOwner();
    const first = owner.begin('edit', 'dialog');
    const second = owner.begin('edit', 'inline', {
      columnIndex: 0,
      fieldNames: ['name'],
      rowIndex: 1,
    });

    expect(first.abortController.signal.aborted).toBe(true);
    expect(owner.owns(first)).toBe(false);
    expect(owner.owns(second)).toBe(true);
  });

  it('accepts only declared inline lifecycle transitions', () => {
    expect(
      canTransitionInlineEditState(
        { status: 'idle' },
        {
          status: 'activating',
          target: { columnIndex: 0, fieldName: 'name', rowIndex: 1 },
        },
      ),
    ).toBe(true);
    expect(() => {
      assertInlineEditStateTransition(
        { status: 'idle' },
        {
          status: 'submitting',
          target: { columnIndex: 0, fieldName: 'name', rowIndex: 1 },
        },
      );
    }).toThrow(EditorOperationBusyError);
  });
});
