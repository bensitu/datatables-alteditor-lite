# Basic ESM example

```ts
import DataTable from 'datatables.net';
import { AltEditorLite } from 'datatables-alteditor-lite';
import 'datatables-alteditor-lite/style.css';

const table = new DataTable('#users', {
  columns: [{ data: 'name' }],
  data: [],
  rowId: 'id',
});

const editor = new AltEditorLite(table, {
  clientSide: {
    createRow: (values) => ({ id: crypto.randomUUID(), name: values.name ?? '' }),
  },
  fields: [{ label: 'Name', name: 'name', required: true, type: 'text' }],
});

await editor.openCreateDialog();
```

This recipe uses only the published root and CSS subpath.
