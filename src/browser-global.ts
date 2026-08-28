import { assertDataTableGlobal } from './datatables/assert-data-table-global.js';
import { registerAltEditorLite } from './datatables/register-alt-editor-lite.js';

const browserScope: object = globalThis;
assertDataTableGlobal(browserScope);
registerAltEditorLite(browserScope.DataTable);

export * from './public-api.js';
export { AltEditorLite as Editor } from './datatables/alt-editor-lite.js';
export { DataTablesHost } from './datatables/datatables-host.js';
export { registerAltEditorLite } from './datatables/register-alt-editor-lite.js';
export type {
  DataTablesInlineTarget,
  DataTablesRecordTarget,
} from './datatables/datatables-host.js';
export type {
  EditTargetSnapshot,
  RemoveTargetSnapshot,
} from './datatables/editor-snapshot.js';
export type {
  InlineEditState as DataTablesInlineEditState,
  InlineTargetSummary,
} from './inline/inline-edit-state.js';
export { StandaloneHost } from './standalone/standalone-host.js';
export type { StandaloneHostOptions } from './standalone/standalone-host.js';
