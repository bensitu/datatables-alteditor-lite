const runtime = globalThis.DataTablesAltEditorLiteStandalone;
if (typeof runtime !== 'object' || runtime === null) {
  throw new Error('The Standalone editor runtime did not load.');
}

const { AltEditorLite, AltEditorLiteError, StandaloneHost } = runtime;
const recordTarget = 'current-record';
const eventTarget = new EventTarget();
let record;

const createButton = document.querySelector('#create-record');
const editButton = document.querySelector('#edit-record');
const removeButton = document.querySelector('#remove-record');
const emptyRecord = document.querySelector('#empty-record');
const recordValues = document.querySelector('#record-values');
const recordName = document.querySelector('#record-name');
const recordEmail = document.querySelector('#record-email');
const operationStatus = document.querySelector('#operation-status');

function renderRecord() {
  const hasRecord = record !== undefined;
  emptyRecord.hidden = hasRecord;
  recordValues.hidden = !hasRecord;
  editButton.disabled = !hasRecord;
  removeButton.disabled = !hasRecord;
  recordName.textContent = record?.name ?? '';
  recordEmail.textContent = record?.email ?? '';
}

const host = new StandaloneHost({
  eventTarget,
  read(target) {
    if (target !== recordTarget || record === undefined) {
      throw new Error('The requested record is no longer available.');
    }
    return record;
  },
  applyCreate(nextRecord) {
    record = nextRecord;
    return recordTarget;
  },
  applyUpdate(_target, nextRecord) {
    record = nextRecord;
    return recordTarget;
  },
  applyRemove() {
    record = undefined;
  },
});

const editor = new AltEditorLite(host, {
  clientSide: {
    createRow: (values) => ({
      email: values.email ?? '',
      id: crypto.randomUUID(),
      name: values.name ?? '',
    }),
  },
  fields: [
    { label: 'Name', name: 'name', required: true, type: 'text' },
    { label: 'Email', name: 'email', required: true, type: 'email' },
  ],
  operations: {
    update: async (values, original, context) => {
      await Promise.resolve();
      context.signal.throwIfAborted();
      if (values.name === 'Unavailable') {
        throw new AltEditorLiteError({
          code: 'NAME_UNAVAILABLE',
          message: 'Choose a different name and try again.',
          retryable: true,
        });
      }
      return {
        ...original,
        email: values.email ?? original.email,
        name: values.name ?? original.name,
      };
    },
  },
});

eventTarget.addEventListener('alteditor-lite:success', (event) => {
  renderRecord();
  operationStatus.textContent = `${event.detail.operation} completed.`;
});
eventTarget.addEventListener('alteditor-lite:error', (event) => {
  operationStatus.textContent = event.detail.error.message;
});

createButton.addEventListener('click', () => {
  void editor.openCreateDialog();
});
editButton.addEventListener('click', () => {
  void editor.openEditDialog(recordTarget);
});
removeButton.addEventListener('click', () => {
  void editor.openRemoveDialog([recordTarget]);
});

globalThis.standaloneExample = {
  editor,
  getRecord: () => record,
};
renderRecord();
