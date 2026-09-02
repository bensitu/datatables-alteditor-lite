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

type EditorFixtureVariant = 'basic' | 'file' | 'slow-validation' | 'theme';

interface ValidationRuntime {
  readonly validationRequests?: {
    readonly signal: AbortSignal;
    resolve(result: { readonly valid: boolean; readonly message?: string }): void;
  }[];
}

function initializationScript(variant: EditorFixtureVariant): string {
  if (variant === 'file') {
    return `
      globalThis.createCalls = 0;
      globalThis.tableApi = new DataTable('#editor-table', {
        columns: [{ data: 'name' }, { data: 'rank' }],
        data: [{ id: 'initial', name: 'Initial', rank: 1 }],
        rowId: 'id'
      });
      globalThis.editor = new AltEditorLite.Editor(
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
          validateOn: 'blur',
          validate: (_value, { signal }) => {
            return new Promise(resolve => {
              (globalThis.validationRequests ??= []).push({ resolve, signal });
            });
          },
        `
      : '';
  const editing =
    variant === 'theme' ? `editing: { dialog: { className: 'theme-dialog' } },` : '';

  return `
    globalThis.createCalls = 0;
    globalThis.tableApi = new DataTable('#editor-table', {
      columns: [{ data: 'name' }, { data: 'rank' }],
      data: [{ id: 'initial', name: 'Initial', rank: 1 }],
      rowId: 'id'
    });
      globalThis.editor = new AltEditorLite.Editor(
      globalThis.tableApi,
      {
        ${editing}
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

test('applies scoped dialog theme tokens', async ({ page }) => {
  await createEditorFixture(page, 'theme');
  await page.addStyleTag({
    content: `
      .theme-dialog {
        --alteditor-lite-font-family: monospace;
        --alteditor-lite-font-size: 20px;
        --alteditor-lite-control-background-color: rgb(1 2 3);
        --alteditor-lite-control-text-color: rgb(250 249 248);
        --alteditor-lite-control-border-color: rgb(7 8 9);
        --alteditor-lite-control-min-height: 47px;
        --alteditor-lite-danger-color: rgb(90 30 40);
        --alteditor-lite-focus-width: 4px;
        --alteditor-lite-focus-offset: 3px;
      }
    `,
  });

  await page.locator('#open-editor').click();
  const dialog = page.locator('dialog.theme-dialog');
  const nameInput = dialog.getByRole('textbox', { exact: true, name: 'Name' });
  await expect(dialog).toBeVisible();
  await expect(nameInput).toBeFocused();

  const theme = await dialog.evaluate((dialogElement) => {
    const dialogStyles = getComputedStyle(dialogElement);
    const inputElement = dialogElement.querySelector('input');
    if (inputElement === null) {
      throw new Error('Expected a themed input.');
    }
    const inputStyles = getComputedStyle(inputElement);
    return {
      background: inputStyles.backgroundColor,
      border: inputStyles.borderTopColor,
      danger: dialogStyles.getPropertyValue('--alteditor-lite-danger-color').trim(),
      error: dialogStyles.getPropertyValue('--alteditor-lite-error-color').trim(),
      focusOffset: inputStyles.outlineOffset,
      focusWidth: inputStyles.outlineWidth,
      fontFamily: dialogStyles.fontFamily,
      fontSize: dialogStyles.fontSize,
      minHeight: inputStyles.minHeight,
      text: inputStyles.color,
    };
  });

  expect(theme).toMatchObject({
    background: 'rgb(1, 2, 3)',
    border: 'rgb(7, 8, 9)',
    focusOffset: '3px',
    focusWidth: '4px',
    fontFamily: 'monospace',
    fontSize: '20px',
    minHeight: '47px',
    text: 'rgb(250, 249, 248)',
  });
  expect(theme.danger).not.toBe(theme.error);

  await page.addStyleTag({
    content: `
      .theme-dialog {
        --alteditor-lite-control-background-color: initial;
        --alteditor-lite-control-text-color: initial;
        --alteditor-lite-control-border-color: initial;
        --alteditor-lite-surface-color: rgb(10 20 30);
        --alteditor-lite-text-color: rgb(240 230 220);
        --alteditor-lite-border-color: rgb(80 90 100);
      }
    `,
  });
  await expect(nameInput).toHaveCSS('background-color', 'rgb(10, 20, 30)');
  await expect(nameInput).toHaveCSS('color', 'rgb(240, 230, 220)');
  await expect(nameInput).toHaveCSS('border-top-color', 'rgb(80, 90, 100)');
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

test('replaces blur validation and suppresses duplicate submit while busy', async ({
  page,
}) => {
  await createEditorFixture(page, 'slow-validation');
  await page.locator('#open-editor').click();
  const dialog = page.locator('dialog');
  await dialog.getByRole('spinbutton', { name: 'Rank' }).fill('3');
  await dialog.getByRole('textbox', { exact: true, name: 'Name' }).fill('One row');
  await dialog.getByRole('spinbutton', { name: 'Rank' }).focus();
  await expect(dialog.locator('.alteditor-lite-field--validating')).toHaveAttribute(
    'aria-busy',
    'true',
  );
  const requestCount = async (): Promise<number> =>
    await page.evaluate(
      () =>
        (globalThis as typeof globalThis & ValidationRuntime).validationRequests
          ?.length ?? 0,
    );
  await expect.poll(requestCount).toBe(1);

  await dialog.locator('form').evaluate((formElement) => {
    if (!(formElement instanceof HTMLFormElement)) {
      throw new Error('Expected an editor form.');
    }
    formElement.requestSubmit();
    formElement.requestSubmit();
  });

  await expect.poll(requestCount).toBe(2);
  const isBlurAborted = await page.evaluate(() => {
    const requests = (globalThis as typeof globalThis & ValidationRuntime)
      .validationRequests;
    requests?.[1]?.resolve({ valid: true });
    return requests?.[0]?.signal.aborted;
  });
  expect(isBlurAborted).toBe(true);

  await expect(page.locator('dialog')).not.toBeVisible();
  await page.evaluate(() => {
    const requests = (globalThis as typeof globalThis & ValidationRuntime)
      .validationRequests;
    requests?.[0]?.resolve({ message: 'Obsolete validation error.', valid: false });
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
