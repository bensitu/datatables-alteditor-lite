import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { EditorOperationTarget } from '../core/editor-operation.js';

/** Stable identity shown by the public inline lifecycle state. */
export interface InlineTargetSummary extends EditorOperationTarget {
  readonly rowIndex: number;
  readonly rowId?: string;
  readonly columnIndex: number;
  readonly columnName?: string;
  readonly fieldName: string;
}

/** Public lifecycle state for the optional inline editor. */
export type InlineEditState =
  | { readonly status: 'disabled' }
  | { readonly status: 'idle' }
  | {
      readonly status: 'activating';
      readonly target: Readonly<InlineTargetSummary>;
    }
  | {
      readonly status: 'editing';
      readonly target: Readonly<InlineTargetSummary>;
      readonly dirty: boolean;
    }
  | {
      readonly status: 'validating';
      readonly target: Readonly<InlineTargetSummary>;
    }
  | {
      readonly status: 'submitting';
      readonly target: Readonly<InlineTargetSummary>;
    }
  | {
      readonly status: 'error';
      readonly target: Readonly<InlineTargetSummary>;
      readonly error: AltEditorLiteError;
    }
  | { readonly status: 'destroyed' };
