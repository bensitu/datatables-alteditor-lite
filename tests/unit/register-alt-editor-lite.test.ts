import { describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { registerAltEditorLite } from '../../src/datatables/register-alt-editor-lite.js';

import type { DataTablesStatic } from 'datatables.net';

describe('registerAltEditorLite', () => {
  it('reports an unsupported runtime when version metadata is unavailable', () => {
    expect(() => {
      registerAltEditorLite({} as DataTablesStatic);
    }).toThrow(EditorConfigurationError);
  });
});
