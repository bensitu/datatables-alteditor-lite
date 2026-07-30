import type { EditorState } from './editor-state.js';

/**
 * Determines whether a lifecycle transition is part of the frozen state graph.
 *
 * @param currentState - State currently owned by the editor.
 * @param nextState - Requested replacement state.
 * @returns Whether the transition is valid.
 */
export function canTransitionEditorState(
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
        (nextState.status === 'open' && nextState.action === currentState.action) ||
        nextState.status === 'ready'
      );
    case 'open':
      return (
        (nextState.status === 'submitting' && nextState.action === currentState.action) ||
        (nextState.status === 'closing' && nextState.action === currentState.action)
      );
    case 'submitting':
      return (
        (nextState.status === 'closing' && nextState.action === currentState.action) ||
        (nextState.status === 'open' && nextState.action === currentState.action)
      );
    case 'refreshing':
      return nextState.status === 'ready';
    case 'closing':
      return nextState.status === 'ready';
  }
}

/**
 * Rejects lifecycle state changes that are not part of the frozen state graph.
 *
 * @param currentState - State currently owned by the editor.
 * @param nextState - Requested replacement state.
 * @throws Error when the transition violates the lifecycle invariant.
 */
export function assertEditorStateTransition(
  currentState: Readonly<EditorState>,
  nextState: Readonly<EditorState>,
): void {
  if (!canTransitionEditorState(currentState, nextState)) {
    throw new Error(
      `Invalid editor state transition: ${currentState.status} -> ${nextState.status}.`,
    );
  }
}
