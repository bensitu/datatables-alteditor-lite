# Optional Buttons and Select example

Load the optional packages before the AltEditorLite entry, then use the registered
button names in the public DataTables layout:

```ts
import DataTable from 'datatables.net';
import 'datatables.net-buttons';
import 'datatables.net-select';
import 'datatables-alteditor-lite';

const table = new DataTable('#users', {
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
```

Without Select, pass an explicit public row selector to Edit and Remove.
