import type { InlineFocusEvent, InlineFocusState } from './inline-focus-state.js';

const transitions: Readonly<
  Record<
    InlineFocusState,
    Readonly<Partial<Record<InlineFocusEvent['type'], InlineFocusState>>>
  >
> = {
  idle: { 'session-mounted': 'editing', destroyed: 'destroyed' },
  editing: {
    'alert-requested': 'alert-opening',
    'cleanup-started': 'cleanup',
    'validation-started': 'validating',
    destroyed: 'destroyed',
  },
  validating: {
    'alert-requested': 'alert-opening',
    'cleanup-started': 'cleanup',
    'operation-returned-to-editing': 'editing',
    'submission-started': 'submitting',
    destroyed: 'destroyed',
  },
  submitting: {
    'alert-requested': 'alert-opening',
    'cleanup-started': 'cleanup',
    'operation-returned-to-editing': 'editing',
    destroyed: 'destroyed',
  },
  'alert-opening': {
    'alert-open-failed': 'editing',
    'alert-opened': 'alert-open',
    'cleanup-started': 'cleanup',
    destroyed: 'destroyed',
  },
  'alert-open': {
    'alert-close-requested': 'alert-closing',
    'cleanup-started': 'cleanup',
    destroyed: 'destroyed',
  },
  'alert-closing': {
    'cleanup-started': 'cleanup',
    'focus-restore-started': 'focus-restoring',
    destroyed: 'destroyed',
  },
  'focus-restoring': {
    'cleanup-started': 'cleanup',
    'focus-restore-failed': 'editing',
    'focus-restored': 'editing',
    destroyed: 'destroyed',
  },
  cleanup: { 'cleanup-complete': 'idle', destroyed: 'destroyed' },
  destroyed: { destroyed: 'destroyed' },
};

/** Controls blur decisions and modal focus transitions independently of edit state. */
export class InlineFocusStateMachine {
  private state: InlineFocusState = 'idle';

  public current(): InlineFocusState {
    return this.state;
  }

  public transition(event: Readonly<InlineFocusEvent>): InlineFocusState {
    const next = transitions[this.state][event.type];
    if (next === undefined) {
      throw new Error(
        `Invalid inline focus transition from ${this.state} using ${event.type}.`,
      );
    }
    this.state = next;
    return next;
  }

  public shouldApplyBlurAction(): boolean {
    return this.state === 'editing';
  }
}
