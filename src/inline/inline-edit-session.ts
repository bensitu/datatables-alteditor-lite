import type { InlineEditView } from './inline-edit-view.js';
import type { InlineNavigationIntent } from './inline-navigation.js';
import type { InlineTargetCapture } from './inline-target-capture.js';
import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { InteractionToken } from '../core/editing/interaction-coordinator.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** Latest change callback failure retained for the matching input revision. */
export interface PendingInlineChangeError {
  readonly revision: number;
  readonly error: AltEditorLiteError;
}

/** Resources and revision state owned by one mounted inline edit. */
export interface InlineEditSession<TRow extends object, TFormValues extends object> {
  readonly capture: InlineTargetCapture<TRow, TFormValues>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly host: InlineEditView;
  readonly interactionToken: InteractionToken;
  readonly normalizedOriginalValue: unknown;
  readonly originalActiveElement: Element | null;
  readonly sessionId: number;
  candidate?: unknown;
  changeRevision: number;
  navigationIntent?: InlineNavigationIntent;
  pendingChange?: Promise<void>;
  pendingChangeError?: PendingInlineChangeError;
}
