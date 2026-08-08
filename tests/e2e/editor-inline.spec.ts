import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const browserBundlePath = resolve(
  repositoryRoot,
  'dist/umd/datatables-alteditor-lite.js',
);
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');

interface RenderedControlsRuntime {
  readonly editor?: {
    destroy(): void;
    openEditDialog(row: string): Promise<void>;
    openInlineEdit(row: string, column: string): Promise<void>;
    submitInlineEdit(): Promise<void>;
  };
  readonly useDialogEditor?: () => void;
  readonly tableApi?: {
    row(row: string): {
      data(): { readonly schedule: string; readonly status: string };
    };
  };
}

async function createInlineFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite inline browser test</title></head>
      <body>
        <main>
          <table id="inline-table">
            <thead><tr><th>Name</th><th>Rank</th></tr></thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#inline-table', {
        columns: [
          { data: 'name', name: 'displayName' },
          { data: 'rank', name: 'rank' }
        ],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1 },
          { id: 'row-b', name: 'Beta', rank: 2 }
        ],
        rowId: 'id'
      });
      globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
        globalThis.tableApi,
        {
          fields: [
            {
              inlineEdit: true,
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              inlineEdit: true,
              label: 'Rank',
              name: 'rank',
              required: true,
              type: 'number'
            }
          ],
          editMode: 'inlineDoubleClick',
          operations: {
            async update(values, original) {
              await new Promise(resolve => globalThis.setTimeout(resolve, 20));
              return {
                ...original,
                name: values.name ?? original.name,
                rank: values.rank ?? original.rank
              };
            }
          }
        }
      );
    `,
  });
}

async function createRenderedControlsFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite rendered controls browser test</title></head>
      <body>
        <main>
          <table id="rendered-controls-table">
            <thead><tr><th>Status</th><th>Schedule</th></tr></thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#rendered-controls-table', {
        columns: [
          { data: 'status', name: 'status' },
          { data: 'schedule', name: 'schedule' }
        ],
        columnDefs: [
          {
            targets: 0,
            render(data, type) {
              if (type !== 'display') return data;
              return '<select aria-label="Rendered status" disabled>' +
                '<option value="open"' + (data === 'open' ? ' selected' : '') + '>Open</option>' +
                '<option value="closed"' + (data === 'closed' ? ' selected' : '') + '>Closed</option>' +
                '<option value="paused"' + (data === 'paused' ? ' selected' : '') + '>Paused</option>' +
                '</select>';
            }
          },
          {
            targets: 1,
            render(data, type) {
              if (type !== 'display') return data;
              return '<input aria-label="Rendered schedule" type="time" value="' + data + '" disabled>';
            }
          }
        ],
        data: [{ id: 'row-a', schedule: '09:00', status: 'open' }],
        rowId: 'id'
      });
      globalThis.editorOptions = {
          clientSide: {
            updateRow(original, values) {
              return {
                ...original,
                schedule: values.schedule ?? original.schedule,
                status: values.status ?? original.status
              };
            }
          },
          fields: [
            {
              inlineEdit: true,
              label: 'Status',
              name: 'status',
              options: [
                { label: 'Open', value: 'open' },
                { label: 'Closed', value: 'closed' },
                { label: 'Paused', value: 'paused' }
              ],
              required: true,
              type: 'select'
            },
            {
              inlineEdit: true,
              label: 'Schedule',
              name: 'schedule',
              required: true,
              type: 'time'
            }
          ],
      };
      globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
        globalThis.tableApi,
        { ...globalThis.editorOptions, editMode: 'inlineDoubleClick' }
      );
      globalThis.useDialogEditor = () => {
        globalThis.editor.destroy();
        globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
          globalThis.tableApi,
          { ...globalThis.editorOptions, editMode: 'dialog' }
        );
      };
    `,
  });
}

test('submits and moves through eligible cells with the keyboard', async ({ page }) => {
  await createInlineFixture(page);
  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & {
      editor?: { openInlineEdit(row: string, column: string): Promise<void> };
    };
    await runtimeScope.editor?.openInlineEdit('#row-a', 'displayName:name');
  });

  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toBeFocused();
  await nameInput.fill('Keyboard Alpha');
  await page.keyboard.press('Tab');

  await expect(page.locator('#row-a')).toContainText('Keyboard Alpha');
  await expect(page.getByRole('spinbutton', { name: 'Rank' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  await expect(page.locator('#row-a')).toContainText('1');
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('opens by double click and has no serious inline accessibility violations', async ({
  page,
}) => {
  await createInlineFixture(page);
  await page.locator('#row-b td').first().dblclick();

  const nameInput = page.getByRole('textbox', { name: 'Name' });
  await expect(nameInput).toHaveValue('Beta');
  const scan = await new AxeBuilder({ page }).include('.alteditor-lite-inline').analyze();
  expect(
    scan.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical',
    ),
  ).toEqual([]);

  await page.keyboard.press('Escape');
  await expect(page.locator('#row-b')).toContainText('Beta');
});

test('redraws columnDefs controls from committed inline and dialog values', async ({
  page,
}) => {
  await createRenderedControlsFixture(page);
  const renderedStatus = page.getByRole('combobox', { name: 'Rendered status' });
  const renderedSchedule = page.getByLabel('Rendered schedule');
  await expect(renderedStatus).toHaveValue('open');
  await expect(renderedSchedule).toHaveValue('09:00');

  await renderedStatus.dispatchEvent('dblclick');
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);

  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.openInlineEdit('#row-a', 'status:name');
  });
  await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Closed' });
  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    await runtimeScope.editor?.submitInlineEdit();
  });

  await expect(renderedStatus).toHaveValue('closed');
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({ schedule: '09:00', status: 'closed' });

  await page.evaluate(async () => {
    const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
    runtimeScope.useDialogEditor?.();
    await runtimeScope.editor?.openEditDialog('#row-a');
  });
  const dialog = page.locator('dialog');
  await dialog
    .getByRole('combobox', { name: 'Status' })
    .selectOption({ label: 'Paused' });
  await dialog.locator('input[type="time"]').fill('10:30');
  await dialog.getByRole('button', { name: 'Submit' }).click();

  await expect(dialog).not.toBeVisible();
  await expect(renderedStatus).toHaveValue('paused');
  await expect(renderedSchedule).toHaveValue('10:30');
  await expect(
    page.evaluate(() => {
      const runtimeScope = globalThis as typeof globalThis & RenderedControlsRuntime;
      return runtimeScope.tableApi?.row('#row-a').data();
    }),
  ).resolves.toMatchObject({ schedule: '10:30', status: 'paused' });
});
