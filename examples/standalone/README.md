# Standalone example

This example uses an in-memory record store and application-owned rendering. It
does not import DataTables.

```html
<label>
  Record key
  <input id="record-key" value="user-1" />
</label>
<button id="create" type="button">Create</button>
<button id="edit" type="button">Edit</button>
<button id="remove" type="button">Remove</button>
<button id="refresh" type="button">Refresh</button>
<pre id="records"></pre>
```

```ts
import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';
import 'datatables-alteditor-lite/style.css';

interface UserRecord {
  readonly id: string;
  readonly name: string;
}

interface UserValues {
  readonly name: string;
}

const initialRecords: readonly UserRecord[] = [
  { id: 'user-1', name: 'Aiko Tanaka' },
  { id: 'user-2', name: 'Jane Smith' },
];
const records = new Map(initialRecords.map((record) => [record.id, record]));
const output = document.querySelector<HTMLPreElement>('#records');
const keyInput = document.querySelector<HTMLInputElement>('#record-key');
let nextId = 3;

if (output === null || keyInput === null) {
  throw new Error('Standalone example controls are unavailable.');
}

function renderRecords(): void {
  output.textContent = JSON.stringify([...records.values()], null, 2);
}

function selectedTarget(): string {
  const target = keyInput.value.trim();
  if (target.length === 0) {
    throw new Error('Enter a record key.');
  }
  return target;
}

const host = new StandaloneHost<UserRecord, string>({
  read(target) {
    const record = records.get(target);
    if (record === undefined) {
      throw new Error('Record unavailable.');
    }
    return record;
  },
  applyCreate(record) {
    records.set(record.id, record);
    renderRecords();
    return record.id;
  },
  applyUpdate(target, record) {
    records.set(target, record);
    renderRecords();
    return target;
  },
  applyRemove(targets) {
    for (const target of targets) {
      records.delete(target);
    }
    renderRecords();
  },
  records: () => [...records].map(([target, row]) => ({ row, target })),
  refresh(signal) {
    signal.throwIfAborted();
    records.clear();
    for (const record of initialRecords) {
      records.set(record.id, record);
    }
    renderRecords();
  },
});

const editor = new AltEditorLite<UserRecord, UserValues, string>(host, {
  clientSide: {
    createRow(values) {
      return {
        id: `user-${String(nextId++)}`,
        name: values.name ?? '',
      };
    },
  },
  fields: [
    {
      label: 'Name',
      name: 'name',
      required: true,
      type: 'text',
      unique: true,
    },
  ],
});

document.querySelector('#create')?.addEventListener('click', () => {
  void editor.openCreateDialog();
});
document.querySelector('#edit')?.addEventListener('click', () => {
  void editor.openEditDialog(selectedTarget());
});
document.querySelector('#remove')?.addEventListener('click', () => {
  void editor.openRemoveDialog([selectedTarget()]);
});
document.querySelector('#refresh')?.addEventListener('click', () => {
  void editor.refresh();
});

window.addEventListener('pagehide', () => editor.destroy(), { once: true });
renderRecords();
```

Create, Edit, and Remove update the application-owned `Map` only through the Host
callbacks. Refresh restores the initial records. The record-key input supplies
the explicit target required by Standalone Edit and Remove operations.
