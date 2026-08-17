# Basic ESM example

```ts
import DataTable from 'datatables.net';
import { DataTablesEditor } from 'datatables-alteditor-lite/datatables';
import 'datatables-alteditor-lite/style.css';

const table = new DataTable('#users', {
  columns: [{ data: 'name' }],
  data: [],
  rowId: 'id',
});

const editor = new DataTablesEditor(table, {
  clientSide: {
    createRow: (values) => ({ id: crypto.randomUUID(), name: values.name ?? '' }),
  },
  editing: {
    dialog: { enabled: true },
    inline: { activation: 'doubleClick', enabled: true },
  },
  fields: [
    {
      inlineEdit: true,
      label: 'Name',
      name: 'name',
      required: true,
      type: 'text',
    },
  ],
});

await editor.openCreateDialog();
```

This recipe uses the explicit DataTables integration and the shared CSS subpath.
