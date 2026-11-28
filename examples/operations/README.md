# Asynchronous operations example

This example uses an Ajax-backed DataTable. Its Ajax source reads the current
records from the service. The reload button closes a failed dialog and runs
that read without submitting its changes again.

```ts
import { AltEditorLite, AltEditorLiteError } from 'datatables-alteditor-lite/datatables';

const reloadButton = document.createElement('button');
reloadButton.type = 'button';
reloadButton.textContent = 'Reload users';
reloadButton.hidden = true;
table.table().container().after(reloadButton);

const editor = new AltEditorLite(table, {
  fields,
  hooks: {
    onError(error, { persistenceOutcome }) {
      if (persistenceOutcome === 'unknown' && !error.retryable) {
        reloadButton.hidden = false;
      }
    },
  },
  operations: {
    async create(values, context) {
      const response = await fetch('/users', {
        body: JSON.stringify(values),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
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
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
      });
      if (!response.ok) {
        throw new Error('Batch update request failed.');
      }
      return await response.json();
    },
  },
});

reloadButton.addEventListener('click', async () => {
  await editor.closeDialog();
  await editor.refresh();
});
```

DataTables changes after the callback returns the complete record for Create
or one replacement record per original ID for multi-record
Edit. Validate the response against the application's record schema before
returning it. These examples send JSON values; upload `File` values using an
application-owned `FormData` request instead of `JSON.stringify`.
