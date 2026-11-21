# Optional DataTables extensions

Load the optional packages before the AltEditorLite entry, then create a Buttons
instance using the registered editor actions:

```ts
import { DataTable } from 'datatables.net';
import 'datatables.net-buttons';
import 'datatables.net-colreorder';
import 'datatables.net-keytable';
import 'datatables.net-select';
import { AltEditorLite } from 'datatables-alteditor-lite/datatables';
import 'datatables-alteditor-lite/style.css';

const table = new DataTable('#users', {
  colReorder: true,
  keys: true,
  select: { style: 'multi' },
});

const editor = new AltEditorLite(table, {
  clientSide: { createRow },
  editing: { inline: { enabled: true } },
  fields,
});

new DataTable.Buttons(table, {
  buttons: [
    'altEditorLiteCreate',
    'altEditorLiteEdit',
    'altEditorLiteRemove',
    'altEditorLiteRefresh',
  ],
})
  .container()
  .prependTo(table.table().container());
```

Supply an application `createRow` function and mark the fields that support
single-cell editing with `inlineEdit: true`. KeyTable enables the configured
focused-cell shortcut (F2 by default), while a completed ColReorder operation
rebuilds inline column mappings in place. Without Select, pass explicit public
row selectors to Edit and Remove. Each extension is optional.
