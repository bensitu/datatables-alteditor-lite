import { assertDataTableGlobal } from './datatables/assert-data-table-global.js';
import { registerAltEditorLite } from './datatables/register-alt-editor-lite.js';

const browserScope: object = globalThis;
assertDataTableGlobal(browserScope);
registerAltEditorLite(browserScope.DataTable);

export * from './public-api.js';
