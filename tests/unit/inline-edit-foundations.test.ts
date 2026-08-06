import { describe, expect, it, vi } from 'vitest';

import {
  EditorDestroyedError,
  EditorOperationBusyError,
} from '../../src/core/alt-editor-lite-error.js';
import { DrawOwnership } from '../../src/core/editing/draw-ownership.js';
import { InteractionCoordinator } from '../../src/core/editing/interaction-coordinator.js';
import { OperationOwner } from '../../src/core/editing/operation-owner.js';
import { isColumnVisiblyAvailable } from '../../src/datatables/column-visibility.js';
import {
  assertInlineEditStateTransition,
  canTransitionInlineEditState,
} from '../../src/inline/inline-edit-state-transition.js';
import { InlineFocusStateMachine } from '../../src/inline/inline-focus-state-machine.js';
import { InlineOriginalContent } from '../../src/inline/inline-original-content.js';

import type { Api } from 'datatables.net';

function createDrawTableStub(): Api<Record<string, unknown>> {
  let drawListener: (() => void) | undefined;
  const table = {
    off: vi.fn((eventName: string, listener?: () => void) => {
      if (listener === undefined || listener === drawListener) {
        drawListener = undefined;
      }
      return table;
    }),
    one: vi.fn((_eventName: string, listener: () => void) => {
      drawListener = listener;
      return table;
    }),
  };
  return table as unknown as Api<Record<string, unknown>>;
}

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

  it('combines DataTables and Responsive column visibility', () => {
    expect(isColumnVisiblyAvailable({ visible: () => true })).toBe(true);
    expect(isColumnVisiblyAvailable({ visible: () => false })).toBe(false);
    expect(
      isColumnVisiblyAvailable({
        responsiveHidden: () => false,
        visible: () => true,
      }),
    ).toBe(false);
    expect(
      isColumnVisiblyAvailable({
        responsiveHidden: () => true,
        visible: () => true,
      }),
    ).toBe(true);
  });

  it('suppresses blur actions during validation and alert focus transfer', () => {
    const focusState = new InlineFocusStateMachine();
    focusState.transition({ type: 'session-mounted' });
    expect(focusState.shouldApplyBlurAction()).toBe(true);

    focusState.transition({ type: 'validation-started' });
    focusState.transition({ type: 'alert-requested' });
    focusState.transition({ type: 'alert-opened' });
    expect(focusState.shouldApplyBlurAction()).toBe(false);

    focusState.transition({ type: 'alert-close-requested' });
    focusState.transition({ type: 'focus-restore-started' });
    focusState.transition({ type: 'focus-restored' });
    expect(focusState.shouldApplyBlurAction()).toBe(true);
    expect(() => focusState.transition({ type: 'alert-opened' })).toThrow(
      'Invalid inline focus transition',
    );
  });

  it('restores cell nodes only while the view still owns the original cell', () => {
    const table = document.createElement('table');
    const cell = document.createElement('td');
    const original = document.createElement('span');
    const view = document.createElement('div');
    original.textContent = 'Original';
    cell.append(original);
    table.append(cell);
    document.body.append(table);

    const ownedContent = InlineOriginalContent.capture(cell, view, table);
    cell.append(view);
    expect(ownedContent.restore()).toBe(true);
    expect(cell.firstChild).toBe(original);

    const staleView = document.createElement('div');
    const staleContent = InlineOriginalContent.capture(cell, staleView, table);
    cell.append(staleView);
    table.remove();
    expect(staleContent.restore()).toBe(false);
    expect(cell.childNodes).toHaveLength(0);
  });
});

describe('owned DataTables draws', () => {
  it('does not start a draw for an already aborted request', async () => {
    const owner = new DrawOwnership(createDrawTableStub());
    const abortController = new AbortController();
    const draw = vi.fn();
    abortController.abort();

    await owner.runWithDraw('inline-edit-success', abortController.signal, draw);

    expect(draw).not.toHaveBeenCalled();
    expect(owner.ownsDraw()).toBe(false);
  });

  it('releases ownership when a draw throws synchronously', async () => {
    const owner = new DrawOwnership(createDrawTableStub());

    await expect(
      owner.runWithDraw('dialog-edit-success', new AbortController().signal, () => {
        throw new Error('Draw failed.');
      }),
    ).rejects.toThrow('Draw failed.');
    expect(owner.ownsDraw()).toBe(false);
  });

  it('settles a pending draw when ownership is destroyed', async () => {
    const owner = new DrawOwnership(createDrawTableStub());
    const pendingDraw = owner.runWithDraw(
      'inline-edit-success',
      new AbortController().signal,
      () => undefined,
    );

    expect(owner.ownsDraw()).toBe(true);
    owner.destroy();

    await pendingDraw;
    expect(owner.ownsDraw()).toBe(false);
    await expect(
      owner.runWhile('refresh', () => Promise.resolve()),
    ).rejects.toBeInstanceOf(EditorDestroyedError);
  });
});
