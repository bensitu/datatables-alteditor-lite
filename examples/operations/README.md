# Asynchronous operations example

```ts
import { AltEditorLite, AltEditorLiteError } from 'datatables-alteditor-lite';

const editor = new AltEditorLite(table, {
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
  },
});
```

DataTables changes only after the callback resolves with a complete row.
