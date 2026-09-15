# Multipart file upload through Operations

Run `npm run build` and `npm run demo`, then open
[the reference examples](http://127.0.0.1:4173/examples/demo/reference.html#multipart).
The implementation is [multipart.js](../demo/multipart.js).

The native `file` field returns `File | null`. Create and Update build `FormData`
and pass the existing operation signal to an asynchronous mock endpoint. The
mock keeps files in the browser and returns a canonical row with a trimmed name,
attachment name, and `attachment: null`, so an Edit starts with an empty file
input. Without a replacement file, the existing attachment is retained.

The host changes displayed records only after persistence succeeds. Enter
`Unavailable` as the document name to exercise operation error handling and
retry. Cancel closes an idle form; closing during submission is rejected as busy.
Page exit destroys the editor and aborts a pending request. The simulated service
observes cancellation before returning its result.

Replace the mock call inside the operation with normal application transport:

```ts
const response = await fetch('/api/documents', {
  method: 'POST',
  body,
  signal: context.signal,
});
if (!response.ok) {
  throw new AltEditorLiteError({
    message: 'Unable to save the document.',
    retryable: true,
  });
}
return await response.json();
```

Let the browser set the multipart content type and boundary. Add application
authentication headers if needed and validate the response shape before returning
it as a canonical row. Server authorization, file validation, storage, and cleanup
remain backend responsibilities. Cancellation does not undo a completed server
write.

## Implementation notes

The public file field, Operations, error, and Standalone Host APIs are sufficient.
No core workaround or private state access was required. FormData construction
and the mock endpoint are ordinary application transport code; no upload
configuration or separate cancellation mechanism was added to the editor.
