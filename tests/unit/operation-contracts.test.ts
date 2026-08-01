import { describe, expect, it } from 'vitest';

import {
  EditorConfigurationError,
  EditorLanguageLoadError,
  EditorSelectionCountError,
} from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
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

  it('exposes a retryable language-loader contract with an optional cause', () => {
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

describe('editor button enablement', () => {
  it('disables unavailable Create and selection actions', () => {
    const state = createEditorButtonState({
      hasCreate: false,
      hasSelect: false,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 0,
    });

    expect(state.create.enabled).toBe(false);
    expect(state.create.title).toContain('Configure');
    expect(state.edit.enabled).toBe(false);
    expect(state.edit.title).toContain('Select is required');
    expect(state.remove.enabled).toBe(false);
    expect(state.refresh.enabled).toBe(true);
  });

  it('enables ready capabilities at their exact selection counts', () => {
    const oneSelected = createEditorButtonState({
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 1,
    });
    const manySelected = createEditorButtonState({
      hasCreate: true,
      hasSelect: true,
      isReady: true,
      language: ENGLISH_LANGUAGE,
      selectedRowCount: 2,
    });
    const noneSelected = createEditorButtonState({
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
});
