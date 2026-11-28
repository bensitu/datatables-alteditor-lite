import {
  AltEditorLite,
  AltEditorLiteError,
  StandaloneHost,
} from '../../../dist/esm/standalone.js';
import { waitForResponse } from '../mock-request.js';

export function initialSales() {
  return [
    { id: 'north', region: 'North', units: 24 },
    { id: 'south', region: 'South', units: 36 },
    { id: 'west', region: 'West', units: 18 },
  ];
}

export const unitsField = {
  name: 'units',
  label: 'Units',
  type: 'number',
  required: true,
  attributes: { min: '0', step: '1' },
};

export async function saveSales(signal) {
  await waitForResponse(signal);
  const failure = document.querySelector('#fail-save');
  if (failure.checked) {
    failure.checked = false;
    throw new AltEditorLiteError({
      message: 'The sales service is unavailable. Try saving again.',
      retryable: true,
    });
  }
}

export function showSales(rows) {
  document.querySelector('output').textContent =
    rows.length === 0
      ? 'No records.'
      : rows.map(({ region, units }) => `${region}: ${units}`).join('\n');
}

export function reportSalesError(error) {
  document.querySelector('[role="status"]').textContent =
    error instanceof AltEditorLiteError
      ? error.message
      : 'The sales view could not be updated.';
}

export function observeSales(editor, target, rows, dispose) {
  target.addEventListener('alteditor-lite:success', () => {
    showSales(rows());
    document.querySelector('[role="status"]').textContent = 'Sales records updated.';
  });
  target.addEventListener('alteditor-lite:error', (event) =>
    reportSalesError(event.detail.error),
  );
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) {
      editor.destroy();
      dispose();
    }
  });
  showSales(rows());
}

export function editSalesRecords({ rows, read, applyUpdate, dispose }) {
  const section = document.querySelector('main');
  const selector = document.querySelector('#region');
  for (const { id, region } of rows()) selector.add(new Option(region, id));
  const host = new StandaloneHost({
    ownershipKey: section,
    eventTarget: section,
    read,
    applyUpdate,
  });
  const editor = new AltEditorLite(host, {
    fields: [
      { name: 'region', label: 'Region', type: 'text', readOnly: true },
      unitsField,
    ],
    operations: {
      async update(values, original, { signal }) {
        await saveSales(signal);
        return { id: original.id, region: original.region, units: values.units };
      },
    },
  });
  observeSales(editor, section, rows, dispose);
  const open = (id) => {
    selector.value = id;
    void editor.openEditDialog(id).catch(reportSalesError);
  };
  document.querySelector('#edit').addEventListener('click', () => open(selector.value));
  return open;
}

/** Keeps the source records separate from their sorted or aggregated presentation. */
export function editSalesView(records, render, dispose) {
  return editSalesRecords({
    rows: () => records,
    read(id) {
      const row = records.find((record) => record.id === id);
      if (row === undefined)
        throw new AltEditorLiteError({ message: 'The region is unavailable.' });
      return row;
    },
    async applyUpdate(id, row, { signal }) {
      const index = records.findIndex((record) => record.id === id);
      if (index < 0)
        throw new AltEditorLiteError({ message: 'The region is unavailable.' });
      signal.throwIfAborted();
      records = records.slice();
      records[index] = row;
      await render(records);
      return id;
    },
    dispose,
  });
}
