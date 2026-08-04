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
const browserBundlePath = resolve(repositoryRoot, 'dist/datatables-alteditor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/alt-editor-lite.css');

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
          inline: { enabled: true },
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
