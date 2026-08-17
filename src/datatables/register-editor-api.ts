import type { DataTablesRecordTarget } from './data-tables-host.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { EditorInstanceLookup } from '../instance/editor-instance-store.js';
import type { Api, DataTablesStatic } from 'datatables.net';

/**
 * Registers the retrieval-only DataTables API method.
 *
 * @param dataTable - DataTables 3.x static constructor.
 * @param instanceLookups - Live cross-bundle instance lookup set.
 */
export function registerEditorApi(
  dataTable: DataTablesStatic,
  instanceLookups: ReadonlySet<EditorInstanceLookup>,
): void {
  dataTable.Api.register(
    'altEditorLite()',
    function altEditorLiteApi(
      this: Api<object>,
    ): AltEditorLite<object, object, DataTablesRecordTarget> | null {
      const tableElement = this.table().node();

      for (const lookupInstance of instanceLookups) {
        const editor = lookupInstance(tableElement);
        if (editor !== null) {
          return editor as AltEditorLite<object, object, DataTablesRecordTarget>;
        }
      }

      return null;
    },
  );
}
