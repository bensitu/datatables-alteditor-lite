import { describe, expect, it } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { DataTablesEditor as AltEditorLite } from '../../src/datatables/data-tables-editor.js';
import { registerAltEditorLite } from '../../src/datatables/register-alt-editor-lite.js';

import type { Api, DataTablesStatic } from 'datatables.net';

describe('registerAltEditorLite', () => {
  it('reports an unsupported runtime when version metadata is unavailable', () => {
    expect(() => {
      registerAltEditorLite({} as DataTablesStatic);
    }).toThrow(EditorConfigurationError);
  });

  it('requires the DataTables API to own a table element', () => {
    const table = {
      table: () => ({ node: () => document.createElement('div') }),
    } as unknown as Api<Record<string, never>>;

    expect(() => {
      new AltEditorLite(table, { fields: [] });
    }).toThrow(
      'AltEditorLite requires a DataTables API that owns an HTML table element.',
    );
  });
});
