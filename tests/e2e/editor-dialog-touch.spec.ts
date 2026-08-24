import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const buttonsScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-buttons/js/dataTables.buttons.js',
);
const selectScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net-select/js/dataTables.select.js',
);
const browserBundlePath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');

async function createDialogTouchFixture(
  page: Page,
  selectionStyle: 'multi' | 'single' = 'single',
): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>AltEditorLite touch dialog test</title>
        <style>
          #touch-dialog-table th,
          #touch-dialog-table td {
            padding: 0.75rem;
          }
        </style>
      </head>
      <body>
        <table id="touch-dialog-table" style="width: 100%">
          <thead><tr><th>Name</th><th>Rank</th></tr></thead>
          <tbody></tbody>
        </table>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: buttonsScriptPath });
  await page.addScriptTag({ path: selectScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({
    content: `
      globalThis.tableApi = new DataTable('#touch-dialog-table', {
        columns: [
          { data: 'name', name: 'name' },
          { data: 'rank', name: 'rank' }
        ],
        data: [
          { id: 'row-a', name: 'Alpha', rank: 1 },
          { id: 'row-b', name: 'Beta', rank: 2 },
          { id: 'row-c', name: 'Gamma', rank: 3 }
        ],
        layout: {
          topStart: {
            buttons: ['altEditorLiteEdit', 'altEditorLiteRemove']
          }
        },
        rowId: 'id',
        select: { style: '${selectionStyle}' }
      });
      globalThis.editor = new AltEditorLite.Editor(
        globalThis.tableApi,
        {
          fields: [
            {
              label: 'Name',
              name: 'name',
              required: true,
              type: 'text'
            },
            {
              label: 'Rank',
              name: 'rank',
              required: true,
              type: 'number'
            }
          ]
        }
      );
    `,
  });
}

test('edits a touch-selected row in the dialog', async ({ page }) => {
  await createDialogTouchFixture(page);
  const alphaRow = page.locator('#row-a');
  const editButton = page.getByRole('button', { exact: true, name: 'Edit' });

  await alphaRow.locator('td').first().tap();
  await expect(editButton).toBeEnabled();
  await editButton.tap();

  const dialog = page.getByRole('dialog', { name: 'Edit row' });
  const nameInput = dialog.getByRole('textbox', { exact: true, name: 'Name' });
  await expect(dialog).toBeVisible();
  await expect(nameInput).toHaveValue('Alpha');
  await nameInput.fill('Touch Alpha');
  await dialog.getByRole('button', { name: 'Submit' }).tap();

  await expect(dialog).toBeHidden();
  await expect(alphaRow).toContainText('Touch Alpha');
});

test('preserves touch-selected rows when removal is cancelled', async ({ page }) => {
  await createDialogTouchFixture(page, 'multi');
  const alphaRow = page.locator('#row-a');
  const betaRow = page.locator('#row-b');
  const removeButton = page.getByRole('button', { exact: true, name: 'Remove' });

  await alphaRow.locator('td').first().tap();
  await betaRow.locator('td').first().tap();
  await expect(removeButton).toBeEnabled();
  await removeButton.tap();

  const dialog = page.getByRole('dialog', { name: 'Remove rows' });
  await expect(dialog).toContainText('Selected rows: 2.');
  await dialog.getByRole('button', { name: 'Cancel' }).tap();

  await expect(dialog).toBeHidden();
  await expect(alphaRow).toContainText('Alpha');
  await expect(betaRow).toContainText('Beta');
});

test('applies a common value to touch-selected rows', async ({ page }) => {
  await createDialogTouchFixture(page, 'multi');
  const alphaRow = page.locator('#row-a');
  const betaRow = page.locator('#row-b');
  const gammaRow = page.locator('#row-c');
  const editButton = page.getByRole('button', { exact: true, name: 'Edit' });

  await alphaRow.locator('td').first().tap();
  await betaRow.locator('td').first().tap();
  await expect(editButton).toBeEnabled();
  await editButton.tap();

  const dialog = page.getByRole('dialog', { name: 'Edit multiple rows' });
  const nameField = dialog.locator('[data-alteditor-lite-batch-field="name"]');
  await expect(nameField).toContainText('Multiple values');
  await nameField.getByRole('button', { name: 'Set a common value' }).tap();
  await nameField.getByRole('textbox', { name: 'Name' }).fill('Shared name');
  await dialog.getByRole('button', { name: 'Submit' }).tap();

  await expect(dialog).toBeHidden();
  await expect(alphaRow).toContainText('Shared name');
  await expect(betaRow).toContainText('Shared name');
  await expect(gammaRow).toContainText('Gamma');
});
