import { describe, expect, it } from 'vitest';

import {
  assertEditorStateTransition,
  canTransitionEditorState,
} from '../../src/core/editor-state-transition.js';

import type { EditorState } from '../../src/core/editor-state.js';

const states: readonly EditorState[] = [
  { status: 'ready' },
  { action: 'create', status: 'opening' },
  { action: 'edit', status: 'opening' },
  { action: 'create', status: 'open' },
  { action: 'edit', status: 'open' },
  { action: 'create', status: 'submitting' },
  { action: 'edit', status: 'submitting' },
  { status: 'refreshing' },
  { action: 'create', status: 'closing' },
  { action: 'edit', status: 'closing' },
  { status: 'destroyed' },
];

function expectedTransition(
  currentState: Readonly<EditorState>,
  nextState: Readonly<EditorState>,
): boolean {
  if (currentState.status === 'destroyed') {
    return false;
  }
  if (nextState.status === 'destroyed') {
    return true;
  }

  switch (currentState.status) {
    case 'ready':
      return nextState.status === 'opening' || nextState.status === 'refreshing';
    case 'opening':
      return (
        nextState.status === 'ready' ||
        (nextState.status === 'open' && nextState.action === currentState.action)
      );
    case 'open':
      return (
        (nextState.status === 'submitting' || nextState.status === 'closing') &&
        nextState.action === currentState.action
      );
    case 'submitting':
      return (
        (nextState.status === 'open' || nextState.status === 'closing') &&
        nextState.action === currentState.action
      );
    case 'refreshing':
    case 'closing':
      return nextState.status === 'ready';
  }
}

describe('editor lifecycle transition graph', () => {
  it('accepts exactly the frozen state graph', () => {
    for (const currentState of states) {
      for (const nextState of states) {
        expect(
          canTransitionEditorState(currentState, nextState),
          `${currentState.status} -> ${nextState.status}`,
        ).toBe(expectedTransition(currentState, nextState));
      }
    }
  });

  it('asserts invalid transitions without changing either state', () => {
    const readyState: EditorState = { status: 'ready' };
    const openingState: EditorState = {
      action: 'create',
      status: 'opening',
    };

    expect(() => {
      assertEditorStateTransition(readyState, openingState);
    }).not.toThrow();
    expect(() => {
      assertEditorStateTransition(readyState, {
        action: 'create',
        status: 'closing',
      });
    }).toThrow('Invalid editor state transition: ready -> closing.');
  });
});
