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
const browserBundlePath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.js');
const stylesheetPath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.css');

type EditorFixtureVariant = 'basic' | 'file' | 'slow-validation';

function initializationScript(variant: EditorFixtureVariant): string {
  if (variant === 'file') {
    return `
      globalThis.createCalls = 0;
      globalThis.tableApi = new DataTable('#editor-table', {
        columns: [{ data: 'name' }, { data: 'rank' }],
        data: [{ id: 'initial', name: 'Initial', rank: 1 }],
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.AltEditorLite(
        globalThis.tableApi,
        {
          fields: [
            {
              label: 'Attachment',
              name: 'attachment',
              required: true,
              type: 'file'
            }
          ],
          clientSide: {
            createRow(values) {
              globalThis.createCalls += 1;
              return {
                id: 'file-row',
                name: values.attachment?.name ?? 'Missing',
                rank: values.attachment?.size ?? 0
              };
            }
          }
        }
      );
      document.querySelector('#open-editor').addEventListener('click', () => {
        void globalThis.editor.openCreateDialog();
      });
    `;
  }

  const validator =
    variant === 'slow-validation'
      ? `
          validate: async () => {
            await new Promise(resolve => {
              globalThis.setTimeout(resolve, 120);
            });
            return { valid: true };
          },
        `
      : '';

  return `
    globalThis.createCalls = 0;
    globalThis.tableApi = new DataTable('#editor-table', {
      columns: [{ data: 'name' }, { data: 'rank' }],
      data: [{ id: 'initial', name: 'Initial', rank: 1 }],
      rowId: 'id'
    });
      globalThis.editor = new AltEditorLite.AltEditorLite(
      globalThis.tableApi,
      {
        fields: [
          {
            label: 'Name',
            name: 'name',
            required: true,
            type: 'text',
            ${validator}
          },
          {
            label: 'Rank',
            name: 'rank',
            required: true,
            type: 'number'
          }
        ],
        clientSide: {
          createRow(values) {
            globalThis.createCalls += 1;
            return {
              id: 'created-row',
              name: values.name ?? '',
              rank: values.rank ?? 0
            };
          }
        }
      }
    );
    document.querySelector('#open-editor').addEventListener('click', () => {
      void globalThis.editor.openCreateDialog();
    });
  `;
}

async function createEditorFixture(
  page: Page,
  variant: EditorFixtureVariant = 'basic',
): Promise<void> {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head><title>AltEditorLite browser test</title></head>
      <body>
        <main>
          <button id="open-editor" type="button">Open editor</button>
          <table id="editor-table">
            <thead>
              <tr><th>Name</th><th>Rank</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </main>
      </body>
    </html>
  `);
  await page.addStyleTag({ path: stylesheetPath });
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({ content: initializationScript(variant) });
}

async function getCreateCallCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      readonly createCalls?: unknown;
    };

    if (typeof runtimeScope.createCalls !== 'number') {
      throw new Error('Expected a numeric Create call count.');
    }

    return runtimeScope.createCalls;
  });
}

test('completes Create with keyboard-only interaction and restores focus', async ({
  page,
}) => {
  await createEditorFixture(page);
  const openButton = page.locator('#open-editor');

  await openButton.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dialog');
  const nameInput = dialog.getByRole('textbox', {
    exact: true,
    name: 'Name',
  });
  const rankInput = dialog.getByRole('spinbutton', { name: 'Rank' });
  await expect(dialog).toBeVisible();
  await expect(nameInput).toBeFocused();

  await page.keyboard.type('Keyboard row');
  await page.keyboard.press('Tab');
  await expect(rankInput).toBeFocused();
  await page.keyboard.type('8');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Submit' })).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(openButton).toBeFocused();
  await expect(page.locator('#created-row')).toContainText('Keyboard row');
  await expect(page.locator('#created-row')).toContainText('8');
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('shows native validation without mutating DataTables', async ({ page }) => {
  await createEditorFixture(page);
  await page.locator('#open-editor').click();
  await page.getByRole('button', { name: 'Submit' }).click();

  const nameInput = page
    .locator('dialog')
    .getByRole('textbox', { exact: true, name: 'Name' });
  await expect(page.locator('dialog')).toBeVisible();
  await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  await expect(nameInput).toBeFocused();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(getCreateCallCount(page)).resolves.toBe(0);
});

test('closes with Escape and restores a connected trigger', async ({ page }) => {
  await createEditorFixture(page);
  const openButton = page.locator('#open-editor');
  await openButton.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('dialog').getByRole('textbox', {
      exact: true,
      name: 'Name',
    }),
  ).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(openButton).toBeFocused();
});

test('falls back to the table when the opening trigger is removed', async ({ page }) => {
  await createEditorFixture(page);
  const openButton = page.locator('#open-editor');
  await openButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog')).toBeVisible();
  await openButton.evaluate((buttonElement) => {
    buttonElement.remove();
  });

  await page.keyboard.press('Escape');

  await expect(page.locator('dialog')).not.toBeVisible();
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const tableElement = document.querySelector('#editor-table');
          return {
            activeElementId: document.activeElement?.id ?? '',
            tableTabIndex:
              tableElement instanceof HTMLElement ? tableElement.tabIndex : null,
          };
        }),
    )
    .toEqual({
      activeElementId: 'editor-table',
      tableTabIndex: -1,
    });
});

test('suppresses duplicate submit while asynchronous validation is busy', async ({
  page,
}) => {
  await createEditorFixture(page, 'slow-validation');
  await page.locator('#open-editor').click();
  const dialog = page.locator('dialog');
  await dialog.getByRole('textbox', { exact: true, name: 'Name' }).fill('One row');
  await dialog.getByRole('spinbutton', { name: 'Rank' }).fill('3');

  await dialog.locator('form').evaluate((formElement) => {
    if (!(formElement instanceof HTMLFormElement)) {
      throw new Error('Expected an editor form.');
    }
    formElement.requestSubmit();
    formElement.requestSubmit();
  });

  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(getCreateCallCount(page)).resolves.toBe(1);
  await expect(page.locator('#created-row')).toHaveCount(1);
});

test('collects a single File without introducing a UI runtime', async ({ page }) => {
  await createEditorFixture(page, 'file');
  await page.locator('#open-editor').click();
  await page.getByLabel('Attachment').setInputFiles({
    buffer: Buffer.from('file smoke'),
    mimeType: 'text/plain',
    name: 'smoke.txt',
  });
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.locator('dialog')).not.toBeVisible();
  await expect(page.locator('#file-row')).toContainText('smoke.txt');
  await expect(getCreateCallCount(page)).resolves.toBe(1);
});

test('has no basic axe violations in the open Create dialog', async ({ page }) => {
  await createEditorFixture(page);
  await page.locator('#open-editor').click();

  const scan = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(scan.violations).toEqual([]);
});
