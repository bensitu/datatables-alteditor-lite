import { describe, expect, it } from 'vitest';

import {
  EditorConfigurationError,
  EditorLanguageLoadError,
  EditorSelectionCountError,
} from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { resolveEditorCapabilities } from '../../src/core/editor-capabilities.js';
import { resolveEditingOptions } from '../../src/core/resolve-editing-options.js';
import { validateOperationConfiguration } from '../../src/core/validate-operation-configuration.js';
import { createEditorButtonState } from '../../src/datatables/register-editor-buttons.js';

describe('operation configuration', () => {
  it('rejects conflicting Create owners', () => {
    expect(() => {
      validateOperationConfiguration({
        clientSide: {
          createRow: () => ({ id: 'client' }),
        },
        fields: [],
        operations: {
          create: () => ({ id: 'remote' }),
        },
      });
    }).toThrow(EditorConfigurationError);
  });

  it('rejects conflicting Update owners', () => {
    expect(() => {
      validateOperationConfiguration({
        clientSide: {
          updateRow: (original) => original,
        },
        fields: [],
        operations: {
          update: (_values, original) => original,
        },
      });
    }).toThrow(EditorConfigurationError);
  });

  it('allows separate capability owners', () => {
    expect(() => {
      validateOperationConfiguration({
        clientSide: {
          updateRow: (original) => original,
        },
        fields: [],
        operations: {
          create: () => ({ id: 'remote' }),
        },
      });
    }).not.toThrow();
  });

  it('exposes stable selection count metadata', () => {
    const error = new EditorSelectionCountError(
      'exactly-one',
      2,
      'Select exactly one row.',
    );

    expect(error).toMatchObject({
      actualCount: 2,
      code: 'SELECTION_COUNT',
      expected: 'exactly-one',
      retryable: true,
    });
  });

  it('exposes retryable language-load errors with an optional cause', () => {
    const defaultError = new EditorLanguageLoadError();
    const cause = new Error('Network unavailable.');
    const causedError = new EditorLanguageLoadError('Japanese failed to load.', cause);

    expect(defaultError).toMatchObject({
      code: 'LANGUAGE_LOAD',
      retryable: true,
    });
    expect(causedError).toMatchObject({
      cause,
      code: 'LANGUAGE_LOAD',
      message: 'Japanese failed to load.',
      retryable: true,
    });
  });

  it('retains a configuration error cause', () => {
    const cause = new TypeError('Invalid option.');

    expect(new EditorConfigurationError('Configuration failed.', cause).cause).toBe(
      cause,
    );
  });
});

describe('editing configuration', () => {
  it('resolves stable dialog and inline defaults', () => {
    const editing = resolveEditingOptions(undefined);

    expect(editing).toEqual({
      dialog: { closeOnSuccess: true, enabled: true },
      inline: {
        activation: 'doubleClick',
        blurAction: 'submit',
        columns: {},
        enabled: false,
        enterAction: 'submit',
        keyboardActivation: { key: 'F2' },
        tabAction: 'submit-and-move',
        updateMode: 'replace-row',
      },
    });
    expect(editing.inline).not.toHaveProperty('className');
  });

  it('resolves independent dialog and inline choices', () => {
    const inlineOnly = resolveEditingOptions({
      dialog: { closeOnSuccess: false, enabled: false },
      inline: {
        activation: 'hover',
        enabled: true,
        keyboardActivation: false,
      },
    });
    const hybrid = resolveEditingOptions({
      dialog: { enabled: true },
      inline: { enabled: true },
    });

    expect(inlineOnly.dialog).toMatchObject({
      closeOnSuccess: false,
      enabled: false,
    });
    expect(inlineOnly.inline).toMatchObject({
      activation: 'hover',
      enabled: true,
      keyboardActivation: false,
    });
    expect(hybrid.dialog.enabled).toBe(true);
    expect(hybrid.inline.enabled).toBe(true);
  });
});

describe('editor button enablement', () => {
  const dialogCapabilities = resolveEditorCapabilities(resolveEditingOptions(undefined), {
    create: true,
  });

  it('disables unavailable selection actions', () => {
    const state = createEditorButtonState({
      capabilities: resolveEditorCapabilities(resolveEditingOptions(undefined), {
        create: false,
      }),
      hasCreate: false,
      hasSelect: false,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 0,
    });

    expect(state.create).toMatchObject({ enabled: false, visible: false });
    expect(state.edit.enabled).toBe(false);
    expect(state.edit.title).toContain('Select is required');
    expect(state.remove.enabled).toBe(false);
    expect(state.refresh.enabled).toBe(true);
  });

  it('enables ready capabilities at their exact selection counts', () => {
    const oneSelected = createEditorButtonState({
      capabilities: dialogCapabilities,
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 1,
    });
    const manySelected = createEditorButtonState({
      capabilities: dialogCapabilities,
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 2,
    });
    const noneSelected = createEditorButtonState({
      capabilities: dialogCapabilities,
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 0,
    });

    expect(oneSelected.create.enabled).toBe(true);
    expect(oneSelected.edit.enabled).toBe(true);
    expect(oneSelected.remove.enabled).toBe(true);
    expect(manySelected.edit.enabled).toBe(false);
    expect(manySelected.edit.title).toContain('exactly one');
    expect(manySelected.remove.enabled).toBe(true);
    expect(noneSelected.remove.enabled).toBe(false);
    expect(noneSelected.remove.title).toContain('one or more');
  });

  it('disables every action while busy with explicit titles', () => {
    const state = createEditorButtonState({
      capabilities: dialogCapabilities,
      hasCreate: true,
      hasSelect: true,
      isReady: false,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 1,
    });

    expect(state.create).toMatchObject({
      enabled: false,
      title: 'The editor is busy.',
    });
    expect(state.edit.enabled).toBe(false);
    expect(state.edit.title).toBe('The editor is busy.');
    expect(state.remove.enabled).toBe(false);
    expect(state.remove.title).toBe('The editor is busy.');
    expect(state.refresh.enabled).toBe(false);
  });

  it('hides Dialog Edit without removing the global button capability', () => {
    const state = createEditorButtonState({
      capabilities: resolveEditorCapabilities(
        resolveEditingOptions({
          dialog: { enabled: false },
          inline: { enabled: true },
        }),
        { create: true },
      ),
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 1,
    });

    expect(state.edit).toMatchObject({ enabled: false, visible: false });
    expect(state.create).toMatchObject({ enabled: true, visible: true });
    expect(state.remove.visible).toBe(true);
    expect(state.refresh.visible).toBe(true);
  });

  it('keeps Create and Remove independent from Dialog Edit', () => {
    const capabilities = resolveEditorCapabilities(
      resolveEditingOptions({ dialog: { enabled: false } }),
      { create: true },
    );

    expect(capabilities).toEqual({
      createDialog: true,
      editDialog: false,
      inlineEdit: false,
      refresh: true,
      removeDialog: true,
    });
  });
});
