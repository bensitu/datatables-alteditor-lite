import DataTable from 'datatables.net';

import './datatables/datatables-augmentation.js';
import { registerAltEditorLite } from './datatables/register-alt-editor-lite.js';

registerAltEditorLite(DataTable);

export * from './datatables-api.js';
