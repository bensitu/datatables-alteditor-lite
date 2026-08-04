import {
  EditorDestroyedError,
  EditorOperationBusyError,
} from '../alt-editor-lite-error.js';

/** Mutually exclusive top-level editor presentation owner. */
export type InteractionOwner = 'none' | 'dialog' | 'inline' | 'refresh' | 'destroyed';

/** Identity required to release an acquired interaction. */
export interface InteractionToken {
  readonly owner: Exclude<InteractionOwner, 'none' | 'destroyed'>;
  readonly sequence: number;
}

/** Coordinates dialog, inline, and refresh presentation ownership. */
export class InteractionCoordinator {
  private owner: InteractionOwner = 'none';

  private sequence = 0;

  /** Acquires an idle coordinator or throws a stable public error. */
  public acquire(
    owner: Exclude<InteractionOwner, 'none' | 'destroyed'>,
  ): InteractionToken {
    if (this.owner === 'destroyed') {
      throw new EditorDestroyedError();
    }
    if (this.owner !== 'none') {
      throw new EditorOperationBusyError();
    }

    this.sequence += 1;
    this.owner = owner;
    return Object.freeze({ owner, sequence: this.sequence });
  }

  /** Releases only the interaction represented by the current token. */
  public release(token: InteractionToken): void {
    if (this.owner === token.owner && this.sequence === token.sequence) {
      this.owner = 'none';
    }
  }

  /** Returns the current owner for integration state. */
  public current(): InteractionOwner {
    return this.owner;
  }

  /** Permanently prevents any new interaction. */
  public destroy(): void {
    this.sequence += 1;
    this.owner = 'destroyed';
  }
}
