# Asynchronous operations example

```ts
import {
  AltEditorLiteError,
  DataTablesEditor,
} from 'datatables-alteditor-lite/datatables';

const editor = new DataTablesEditor(table, {
  fields,
  operations: {
    async create(values, context) {
      const response = await fetch('/users', {
        body: JSON.stringify(values),
        method: 'POST',
        signal: context.signal,
      });
      if (response.status === 409) {
        throw new AltEditorLiteError({
          fieldErrors: { email: 'This email is already registered.' },
          message: 'Correct the highlighted field.',
          retryable: true,
        });
      }
      return await response.json();
    },
    async updateMany(changes, originals, context) {
      const response = await fetch('/users/batch', {
        body: JSON.stringify({
          changes,
          ids: originals.map((row) => row.id),
        }),
        method: 'PATCH',
        signal: context.signal,
      });
      if (!response.ok) {
        throw new AltEditorLiteError({
          message: 'The selected users could not be updated.',
          retryable: true,
        });
      }
      return await response.json();
    },
  },
});
```

DataTables changes only after the callback resolves with a complete row.
