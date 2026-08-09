import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const selectScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-select/js/dataTables.select.js',
);
const browserBundlePath = resolve(
  repositoryRoot,
  'dist/umd/datatables-alteditor-lite.js',
);
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');

async function createTouchFixture(page: Page): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AltEditorLite touch inline test</title>
      </head>
      <body>
        <button id="outside" type="button">Outside</button>
        <table id="touch-table">
          <thead><tr><th>Name</th><th>Rank</th></tr></thead>
          <tbody></tbody>
        </table>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: selectScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#touch-table', {
        columns: [
          { data: 'name', name: 'name' },
          { data: 'rank', name: 'rank' }
        ],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1 },
          { id: 'row-b', name: 'Beta', rank: 2 }
        ],
        rowId: 'id',
        select: { style: 'single' }
      });
      globalThis.editor = new DataTablesAltEditorLite.AltEditorLite(
        globalThis.tableApi,
        {
          editMode: 'inlineHover',
          fields: [
            {
              inlineEdit: true,
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              allowClear: true,
              debounceMs: 0,
              inlineEdit: true,
              label: 'Rank',
              loadOptions(query, { signal }) {
                return new Promise((resolve, reject) => {
                  const timer = globalThis.setTimeout(() => {
                    resolve([
                      { label: 'Rank 1', value: 1 },
                      { label: 'Rank 2', value: 2 }
                    ].filter(option => option.label.includes(query)));
                  }, 25);
                  signal.addEventListener('abort', () => {
                    globalThis.clearTimeout(timer);
                    reject(new DOMException('Aborted', 'AbortError'));
                  }, { once: true });
                });
              },
              name: 'rank',
              resolveOption(value, { signal }) {
                return new Promise((resolve, reject) => {
                  const timer = globalThis.setTimeout(
                    () => resolve({ label: 'Rank ' + String(value), value }),
                    20
                  );
                  signal.addEventListener('abort', () => {
                    globalThis.clearTimeout(timer);
                    reject(new DOMException('Aborted', 'AbortError'));
                  }, { once: true });
                });
              },
              type: 'search-select'
            }
          ]
        }
      );
    `,
  });
}

test('reveals one trigger before editing and keeps explicit touch resolution', async ({
  page,
}, testInfo) => {
  await createTouchFixture(page);
  const cell = page.locator('#row-a td').first();
  await cell.tap();

  if (testInfo.project.name === 'mobile-chromium') {
    await expect(page.locator('#row-a')).toHaveClass(/selected/);
  }
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(0);
  const trigger = cell.getByRole('button', { name: 'Edit cell' });
  await expect(trigger).toBeVisible();
  await trigger.tap();

  const input = page.getByRole('textbox', { name: 'Name' });
  await expect(input).toHaveValue('Alpha');
  await input.fill('Touch Alpha');
  await page.getByRole('button', { name: 'Outside' }).tap();
  await expect(page.locator('.alteditor-lite-inline')).toHaveCount(1);
  await page.getByRole('button', { name: 'Submit' }).tap();
  await expect(page.locator('#row-a')).toContainText('Touch Alpha');

  await cell.tap();
  await cell.getByRole('button', { name: 'Edit cell' }).tap();
  await page.getByRole('textbox', { name: 'Name' }).fill('Discarded');
  await page.getByRole('button', { name: 'Cancel' }).tap();
  await expect(page.locator('#row-a')).toContainText('Touch Alpha');
});

test('loads and commits a remote option on touch', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await createTouchFixture(page);
  const cell = page.locator('#row-a td').nth(1);
  await cell.tap();
  await cell.getByRole('button', { name: 'Edit cell' }).tap();
  const input = page.getByRole('combobox', { name: 'Rank' });
  await input.fill('2');
  await page.getByRole('option', { name: 'Rank 2' }).tap();
  await page.getByRole('button', { name: 'Submit' }).tap();
  await expect(page.locator('#row-a td').nth(1)).toHaveText('2');
});
