import {
  AltEditorLite,
  AltEditorLiteError,
  StandaloneHost,
} from '../../dist/esm/standalone.js';

import { waitForResponse } from './mock-request.js';

const section = document.querySelector('#parent-child');
const selection = section.querySelector('select');
const status = section.querySelector('[role="status"]');
const orders = new Map([
  ['order-1', { id: 'order-1', name: 'Office supplies' }],
  ['order-2', { id: 'order-2', name: 'Workshop supplies' }],
]);
const lines = new Map([
  ['line-1', { id: 'line-1', parentId: 'order-1', product: 'Paper', quantity: 2 }],
  ['line-2', { id: 'line-2', parentId: 'order-2', product: 'Pencils', quantity: 5 }],
]);
let currentParentId;
let childEditor;

function render() {
  selection.replaceChildren();
  for (const order of orders.values()) {
    selection.add(new Option(order.name, order.id));
  }
  selection.value = currentParentId ?? '';
  const currentLines = [...lines.values()].filter(
    (row) => row.parentId === currentParentId,
  );
  section.querySelector('output').textContent =
    currentLines.map((row) => `${row.product}: ${row.quantity}`).join('\n') ||
    'No order lines.';
  section.querySelector('[data-action="create-child"]').disabled =
    currentParentId === undefined;
  section.querySelector('[data-action="edit-child"]').disabled =
    currentLines.length === 0;
}

function selectParent(parentId) {
  childEditor?.destroy();
  currentParentId = parentId;
  const readLine = (id) => {
    const line = lines.get(id);
    if (line === undefined || line.parentId !== parentId) {
      throw new AltEditorLiteError({ message: 'The order line is unavailable.' });
    }
    return line;
  };
  const childHost = new StandaloneHost({
    eventTarget: section,
    read: readLine,
    applyCreate(row) {
      lines.set(row.id, row);
      render();
      return row.id;
    },
    applyUpdate(id, row) {
      readLine(id);
      lines.set(id, row);
      render();
      return id;
    },
  });
  const saveLine = async (values, original, context) => {
    await waitForResponse(context.signal);
    if (values.product === 'Unavailable') {
      throw new AltEditorLiteError({
        message: 'Choose another product and retry.',
        fieldErrors: { product: 'This product is unavailable.' },
        retryable: true,
      });
    }
    return {
      id: original?.id ?? crypto.randomUUID(),
      parentId,
      product: (values.product ?? original?.product ?? '').trim(),
      quantity: values.quantity ?? original?.quantity ?? 1,
    };
  };
  childEditor = new AltEditorLite(childHost, {
    fields: [
      { type: 'text', name: 'product', label: 'Product', required: true },
      {
        type: 'number',
        name: 'quantity',
        label: 'Quantity',
        defaultValue: 1,
        required: true,
        attributes: { min: '1', step: '1' },
      },
    ],
    operations: {
      create: (values, context) => saveLine(values, undefined, context),
      update: saveLine,
    },
  });
  render();
}

const parentHost = new StandaloneHost({
  eventTarget: section,
  read: (id) => orders.get(id),
  applyCreate(row) {
    orders.set(row.id, row);
    selectParent(row.id);
    return row.id;
  },
  applyUpdate(id, row) {
    orders.set(id, row);
    render();
    return id;
  },
});
const parentEditor = new AltEditorLite(parentHost, {
  fields: [{ type: 'text', name: 'name', label: 'Order name', required: true }],
  operations: {
    async create(values, context) {
      await waitForResponse(context.signal);
      return { id: crypto.randomUUID(), name: values.name.trim() };
    },
    async update(values, original, context) {
      await waitForResponse(context.signal);
      return { ...original, name: values.name.trim() };
    },
  },
});
selection.addEventListener('change', () => selectParent(selection.value));
section.querySelector('[data-action="create-parent"]').addEventListener('click', () => {
  void parentEditor.openCreateDialog();
});
section.querySelector('[data-action="edit-parent"]').addEventListener('click', () => {
  void parentEditor.openEditDialog(currentParentId);
});
section.querySelector('[data-action="create-child"]').addEventListener('click', () => {
  void childEditor.openCreateDialog();
});
section.querySelector('[data-action="edit-child"]').addEventListener('click', () => {
  const line = [...lines.values()].find((row) => row.parentId === currentParentId);
  if (line !== undefined) void childEditor.openEditDialog(line.id);
});
section.addEventListener('alteditor-lite:error', (event) => {
  status.textContent = event.detail.error.message;
});
section.addEventListener('alteditor-lite:success', () => {
  status.textContent = 'Saved.';
});
window.addEventListener(
  'pagehide',
  () => {
    childEditor?.destroy();
    parentEditor.destroy();
  },
  { once: true },
);
selectParent('order-1');
