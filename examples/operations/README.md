# Asynchronous operations example

```ts
import { AltEditorLite, AltEditorLiteError } from 'datatables-alteditor-lite/datatables';

const editor = new AltEditorLite(table, {
  fields,
  operations: {
    async create(values, context) {
      const response = await fetch('/users', {
        body: JSON.stringify(values),
        headers: { 'Content-Type': 'application/json' },
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
      if (!response.ok) {
        throw new Error('Create request failed.');
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
        headers: { 'Content-Type': 'application/json' },
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
Validate the response against the application's record schema before returning
it. These examples send JSON values; upload `File` values using an
application-owned `FormData` request instead of `JSON.stringify`.
