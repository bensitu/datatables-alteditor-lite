import { EditorDestroyedError } from './alt-editor-lite-error.js';
import { assertEditorStateTransition } from './editor-state-transition.js';

import type { EditorState } from './editor-state.js';

/** Owns the editor lifecycle state and publishes every accepted transition. */
export class EditorStateCoordinator {
  private state: EditorState = { status: 'ready' };

  public constructor(private readonly notifyChange: () => void) {}

  /** Returns the current immutable lifecycle view. */
  public getState(): Readonly<EditorState> {
    return this.state;
  }

  /** Rejects work after the editor has been destroyed. */
  public assertActive(): void {
    if (this.state.status === 'destroyed') {
      throw new EditorDestroyedError();
    }
  }

  /** Applies one valid lifecycle transition. */
  public transitionTo(nextState: EditorState): void {
    assertEditorStateTransition(this.state, nextState);
    this.state = nextState;
    this.notifyChange();
  }

  /** Permanently closes the lifecycle state. */
  public destroy(): void {
    if (this.state.status !== 'destroyed') {
      this.transitionTo({ status: 'destroyed' });
    }
  }
}
