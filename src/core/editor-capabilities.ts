import type { ResolvedEditingOptions } from './resolve-editing-options.js';

/** Features available from one editor instance. */
export interface EditorCapabilities {
  readonly batchEditDialog: boolean;
  readonly createDialog: boolean;
  readonly editDialog: boolean;
  readonly inlineEdit: boolean;
  readonly removeDialog: boolean;
  readonly refresh: boolean;
}

/** Persistence ownership relevant to editor capabilities. */
export interface EditorCapabilityOwners {
  readonly batchEdit: boolean;
  readonly create: boolean;
}

/** Derives instance capabilities from resolved configuration and ownership. */
export function resolveEditorCapabilities<TFormValues extends object>(
  editing: Readonly<ResolvedEditingOptions<TFormValues>>,
  owners: Readonly<EditorCapabilityOwners>,
): Readonly<EditorCapabilities> {
  return Object.freeze({
    batchEditDialog: editing.dialog.enabled && owners.batchEdit,
    createDialog: owners.create,
    editDialog: editing.dialog.enabled,
    inlineEdit: editing.inline.enabled,
    refresh: true,
    removeDialog: true,
  });
}
