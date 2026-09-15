import {
  AltEditorLite,
  AltEditorLiteError,
  StandaloneHost,
} from '../../dist/esm/standalone.js';

import { waitForResponse } from './mock-request.js';

const section = document.querySelector('#multipart');
const status = section.querySelector('[role="status"]');
let savedDocument;

/** Receives the same request body and signal as a multipart HTTP endpoint. */
async function saveDocument(body, signal, original) {
  await waitForResponse(signal);
  const name = body.get('name');
  if (name === 'Unavailable') {
    throw new AltEditorLiteError({
      message: 'The document service is unavailable. Retry with a different name.',
      retryable: true,
    });
  }
  const attachment = body.get('attachment');
  return {
    id: original?.id ?? crypto.randomUUID(),
    name: String(name).trim(),
    attachmentName:
      attachment instanceof File ? attachment.name : (original?.attachmentName ?? ''),
    attachment: null,
  };
}

function persist(values, original, context) {
  const body = new FormData();
  body.set('name', values.name);
  if (values.attachment instanceof File) body.set('attachment', values.attachment);
  status.textContent = 'Saving document…';
  return saveDocument(body, context.signal, original);
}

function applyDocument(row) {
  savedDocument = row;
  section.querySelector('output').textContent =
    `${row.name}\nAttachment: ${row.attachmentName || 'None'}`;
  section.querySelector('[data-action="edit"]').disabled = false;
  return row.id;
}

const host = new StandaloneHost({
  eventTarget: section,
  read(id) {
    if (savedDocument?.id !== id) throw new Error('Document unavailable.');
    return savedDocument;
  },
  applyCreate: applyDocument,
  applyUpdate: (_id, row) => applyDocument(row),
});
const editor = new AltEditorLite(host, {
  fields: [
    { name: 'name', label: 'Document name', type: 'text', required: true },
    {
      name: 'attachment',
      label: 'Attachment',
      type: 'file',
      encoding: 'file',
      description:
        'Optional replacement. Existing attachments remain when no file is selected.',
    },
  ],
  operations: {
    create: (values, context) => persist(values, undefined, context),
    update: persist,
  },
});
section.querySelector('[data-action="create"]').addEventListener('click', () => {
  void editor.openCreateDialog();
});
section.querySelector('[data-action="edit"]').addEventListener('click', () => {
  void editor.openEditDialog(savedDocument.id);
});
section.addEventListener('alteditor-lite:success', () => {
  status.textContent = 'Saved.';
});
section.addEventListener('alteditor-lite:error', (event) => {
  status.textContent = event.detail.error.message;
});
section.addEventListener('alteditor-lite:close', (event) => {
  if (event.detail.reason !== 'success') status.textContent = 'Editing cancelled.';
});
window.addEventListener('pagehide', () => editor.destroy(), { once: true });
