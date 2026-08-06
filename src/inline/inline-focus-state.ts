/** Focus lifecycle for one inline editing presentation. */
export type InlineFocusState =
  | 'idle'
  | 'editing'
  | 'validating'
  | 'submitting'
  | 'alert-opening'
  | 'alert-open'
  | 'alert-closing'
  | 'focus-restoring'
  | 'cleanup'
  | 'destroyed';

/** Events accepted by the inline focus state machine. */
export type InlineFocusEvent =
  | { readonly type: 'session-mounted' }
  | { readonly type: 'validation-started' }
  | { readonly type: 'submission-started' }
  | { readonly type: 'alert-requested' }
  | { readonly type: 'alert-opened' }
  | { readonly type: 'alert-close-requested' }
  | { readonly type: 'focus-restore-started' }
  | { readonly type: 'focus-restored' }
  | { readonly type: 'focus-restore-failed' }
  | { readonly type: 'operation-returned-to-editing' }
  | { readonly type: 'cleanup-started' }
  | { readonly type: 'cleanup-complete' }
  | { readonly type: 'destroyed' };

/** Identity used to reject stale focus restoration after an alert closes. */
export interface InlineFocusRestoreToken {
  readonly sessionId: number;
  readonly alertId: number;
}
