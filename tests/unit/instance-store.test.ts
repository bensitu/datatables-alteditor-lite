import { describe, expect, it } from 'vitest';

import { EditorAlreadyInitializedError } from '../../src/core/alt-editor-lite-error.js';
import {
  deleteEditorInstance,
  getEditorInstance,
  storeEditorInstance,
} from '../../src/instance/editor-instance-store.js';

describe('editor instance store', () => {
  it('uses a plain object as an ownership identity', () => {
    const ownershipKey = {};
    const editor = {};

    storeEditorInstance(ownershipKey, editor);

    expect(getEditorInstance(ownershipKey)).toBe(editor);
    expect(deleteEditorInstance(ownershipKey, editor)).toBe(true);
  });

  it('stores one identity per table and deletes only for its owner', () => {
    const tableElement = document.createElement('table');
    const editor = { marker: 'editor' };
    const otherEditor = { marker: 'other' };

    expect(getEditorInstance(tableElement)).toBeNull();
    storeEditorInstance(tableElement, editor);
    expect(getEditorInstance(tableElement)).toBe(editor);
    expect(deleteEditorInstance(tableElement, otherEditor)).toBe(false);
    expect(getEditorInstance(tableElement)).toBe(editor);
    expect(deleteEditorInstance(tableElement, editor)).toBe(true);
    expect(getEditorInstance(tableElement)).toBeNull();
  });

  it('rejects a duplicate active instance', () => {
    const tableElement = document.createElement('table');
    const editor = {};
    storeEditorInstance(tableElement, editor);

    expect(() => {
      storeEditorInstance(tableElement, {});
    }).toThrow(EditorAlreadyInitializedError);
    expect(deleteEditorInstance(tableElement, editor)).toBe(true);
  });
});
