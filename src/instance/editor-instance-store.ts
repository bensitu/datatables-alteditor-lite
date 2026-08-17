import { EditorAlreadyInitializedError } from '../core/alt-editor-lite-error.js';

const editorByOwnershipKey = new WeakMap<object, object>();

/**
 * Opaque instance lookup shared by idempotent registration records.
 */
export type EditorInstanceLookup = (ownershipKey: object) => object | null;

/**
 * Stores the single active editor associated with an ownership identity.
 *
 * @param ownershipKey - Stable object identity exposed by the host.
 * @param editor - Editor instance that owns the identity.
 * @throws EditorAlreadyInitializedError when another active instance exists.
 */
export function storeEditorInstance(ownershipKey: object, editor: object): void {
  if (editorByOwnershipKey.has(ownershipKey)) {
    throw new EditorAlreadyInitializedError();
  }

  editorByOwnershipKey.set(ownershipKey, editor);
}

/**
 * Retrieves an editor through the identity that originally stored it.
 *
 * This is the single internal boundary at which the generic instance type is
 * recovered from the intentionally opaque WeakMap.
 *
 * @param ownershipKey - Stable object identity exposed by the host.
 * @returns The active editor, or null when the identity has none.
 */
export function getEditorInstance(ownershipKey: object): object | null {
  return editorByOwnershipKey.get(ownershipKey) ?? null;
}

/**
 * Deletes an instance only when the caller still owns the stored identity.
 *
 * @param ownershipKey - Stable object identity exposed by the host.
 * @param editor - Editor that expects to own the identity.
 * @returns Whether the stored identity was removed.
 */
export function deleteEditorInstance(ownershipKey: object, editor: object): boolean {
  if (editorByOwnershipKey.get(ownershipKey) !== editor) {
    return false;
  }

  return editorByOwnershipKey.delete(ownershipKey);
}
