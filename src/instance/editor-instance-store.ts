import { EditorAlreadyInitializedError } from '../core/alt-editor-lite-error.js';

const editorByTableElement = new WeakMap<HTMLTableElement, object>();

/**
 * Opaque instance lookup shared by idempotent registration records.
 */
export type EditorInstanceLookup = (tableElement: HTMLTableElement) => object | null;

/**
 * Stores the single active editor associated with a table element.
 *
 * @param tableElement - Public DataTables table node.
 * @param editor - Editor instance that owns the table.
 * @throws EditorAlreadyInitializedError when another active instance exists.
 */
export function storeEditorInstance(
  tableElement: HTMLTableElement,
  editor: object,
): void {
  if (editorByTableElement.has(tableElement)) {
    throw new EditorAlreadyInitializedError();
  }

  editorByTableElement.set(tableElement, editor);
}

/**
 * Retrieves an editor through the table identity that originally stored it.
 *
 * This is the single internal boundary at which the generic instance type is
 * recovered from the intentionally opaque WeakMap.
 *
 * @param tableElement - Public DataTables table node.
 * @returns The active editor, or null when the table has none.
 */
export function getEditorInstance(tableElement: HTMLTableElement): object | null {
  return editorByTableElement.get(tableElement) ?? null;
}

/**
 * Deletes an instance only when the caller still owns the stored identity.
 *
 * @param tableElement - Public DataTables table node.
 * @param editor - Editor that expects to own the table.
 * @returns Whether the stored identity was removed.
 */
export function deleteEditorInstance(
  tableElement: HTMLTableElement,
  editor: object,
): boolean {
  if (editorByTableElement.get(tableElement) !== editor) {
    return false;
  }

  return editorByTableElement.delete(tableElement);
}
