# Optional DataTables extensions

Load the optional packages before the AltEditorLite entry, then use the registered
button names in the public DataTables layout:

```ts
import DataTable from 'datatables.net';
import 'datatables.net-buttons';
import 'datatables.net-colreorder';
import 'datatables.net-keytable';
import 'datatables.net-select';
import { AltEditorLite } from 'datatables-alteditor-lite/datatables';
import 'datatables-alteditor-lite/style.css';

const table = new DataTable('#users', {
  colReorder: true,
  keys: true,
  layout: {
    topStart: {
      buttons: [
        'altEditorLiteCreate',
        'altEditorLiteEdit',
        'altEditorLiteRemove',
        'altEditorLiteRefresh',
      ],
    },
  },
  select: { style: 'multi' },
});

const editor = new AltEditorLite(table, { fields });
```

Without Select, pass an explicit public row selector to Edit and Remove.
KeyTable enables the configured focused-cell shortcut (F2 by default), while a
completed ColReorder operation rebuilds inline column mappings in place. These
extensions remain development/application dependencies rather than required
AltEditorLite runtime peers.
