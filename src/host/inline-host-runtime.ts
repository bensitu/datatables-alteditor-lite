import type { AltEditorLiteError } from '../core/alt-editor-lite-error.js';
import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type {
  AltEditorLiteOptions,
  EditorErrorHookContext,
} from '../core/alt-editor-lite-options.js';
import type { EditOperationRunner } from '../core/editing/edit-operation-runner.js';
import type { InteractionCoordinator } from '../core/editing/interaction-coordinator.js';
import type { OperationOwner } from '../core/editing/operation-owner.js';
import type { EditorValues } from '../core/editor-values.js';
import type { ResolvedEditingOptions } from '../core/resolve-editing-options.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { InlineEditState } from '../inline/inline-edit-state.js';

/** Services supplied to a Host that owns an inline editing presentation. */
export interface InlineHostRuntimeArguments<
  TRow extends object,
  TFormValues extends object,
> {
  readonly editor: object;
  readonly enabled: boolean;
  readonly editOperationRunner: EditOperationRunner<TRow, TFormValues>;
  readonly editorOptions: Readonly<AltEditorLiteOptions<TRow, TFormValues>>;
  readonly fields: readonly FieldConfig<TFormValues>[];
  readonly instanceId: string;
  readonly interactionCoordinator: InteractionCoordinator;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly notifyIntegration: () => void;
  readonly operationOwner: OperationOwner;
  readonly editing: Readonly<ResolvedEditingOptions<TFormValues>>;
  readonly reportError: (
    error: AltEditorLiteError,
    context: EditorErrorHookContext,
    publishEvent: boolean,
  ) => void;
  readonly validateUnique: (
    values: Readonly<EditorValues<TFormValues>>,
    excludedRow: TRow,
  ) => Readonly<Record<string, string>>;
}

/** Host-owned inline editing lifecycle used by the neutral editor runtime. */
export interface InlineHostRuntime {
  open(target: unknown): Promise<void>;
  submit(): Promise<void>;
  cancel(): Promise<void>;
  getState(): Readonly<InlineEditState>;
  isEditing(): boolean;
  prepareForExternalOperation(): Promise<void>;
  allowsExternalOperation(): boolean;
  destroy(): void;
}

/** Optional capability for Hosts that provide an inline presentation. */
export interface InlineHostRuntimeFactory<TRow extends object> {
  createInlineRuntime<TFormValues extends object>(
    arguments_: InlineHostRuntimeArguments<TRow, TFormValues>,
  ): InlineHostRuntime;
}

/** Detects inline runtime support on a concrete Host. */
export function hasInlineHostRuntimeFactory<TRow extends object>(
  host: object,
): host is InlineHostRuntimeFactory<TRow> {
  return 'createInlineRuntime' in host && typeof host.createInlineRuntime === 'function';
}
