import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const browserBundlePath = resolve(repositoryRoot, 'dist/datatables-alteditor-lite.js');
const japaneseLocaleBundlePath = resolve(
  repositoryRoot,
  'dist/locales/datatables-alteditor-lite.ja.js',
);

test('requires the DataTables browser global to load first', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>');
  const pageErrorPromise = page.waitForEvent('pageerror');

  await page.addScriptTag({ path: browserBundlePath });

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain(
    'DataTables must be loaded before datatables-alteditor-lite.',
  );
  await expect(page.evaluate(() => 'jQuery' in globalThis)).resolves.toBe(false);
});

test('loads after globalThis.DataTable without introducing jQuery', async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <table id="contract-table">
          <thead>
            <tr><th>Name</th></tr>
          </thead>
          <tbody>
            <tr><td>Alpha</td></tr>
          </tbody>
        </table>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: dataTablesScriptPath });

  const baselineState = await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      DataTable?: {
        readonly version?: unknown;
      };
    };

    return {
      dataTableType: typeof runtimeScope.DataTable,
      dataTableVersion: runtimeScope.DataTable?.version,
      hasJQuery: 'jQuery' in globalThis,
    };
  });

  expect(baselineState).toEqual({
    dataTableType: 'function',
    dataTableVersion: '3.0.0',
    hasJQuery: false,
  });

  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({ path: browserBundlePath });

  const loadedState = await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      DataTable?: {
        new (selector: string): {
          altEditorLite(): unknown;
          destroy(): void;
        };
        readonly version?: unknown;
      };
      DataTablesAltEditorLite?: {
        readonly AltEditorLite?: new (
          table: object,
          options: { readonly fields: readonly [] },
        ) => { destroy(): void };
      };
    };
    const dataTableConstructor = runtimeScope.DataTable;
    const editorConstructor = runtimeScope.DataTablesAltEditorLite?.AltEditorLite;

    if (dataTableConstructor === undefined || editorConstructor === undefined) {
      throw new Error('Expected both browser globals after bundle loading.');
    }

    const table = new dataTableConstructor('#contract-table');
    const editor = new editorConstructor(table, { fields: [] });
    const isGetterMatchedToSecondBundleInstance = table.altEditorLite() === editor;
    editor.destroy();
    table.destroy();

    return {
      dataTableType: typeof runtimeScope.DataTable,
      dataTableVersion: runtimeScope.DataTable?.version,
      isGetterMatchedToSecondBundleInstance,
      hasJQuery: 'jQuery' in globalThis,
    };
  });

  expect(loadedState).toEqual({
    ...baselineState,
    isGetterMatchedToSecondBundleInstance: true,
  });
});

test('requires the core Browser Global before a locale bundle', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>');
  const pageErrorPromise = page.waitForEvent('pageerror');

  await page.addScriptTag({ path: japaneseLocaleBundlePath });

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain(
    'DataTablesAltEditorLite core must be loaded before a locale bundle.',
  );
});

test('registers locale bundles through the public core registry', async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html>
      <body>
        <table id="locale-table"><thead><tr><th>Name</th></tr></thead></table>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });
  await page.addScriptTag({ path: japaneseLocaleBundlePath });

  const localeState = await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      DataTablesAltEditorLite?: {
        getLocale(localeName: string):
          | {
              readonly actions: { readonly create: string };
              readonly locale: string;
            }
          | undefined;
        getRegisteredLocaleNames(): readonly string[];
        registerLocale(localeName: string, language: object): void;
      };
    };
    const localeApi = runtimeScope.DataTablesAltEditorLite;
    if (localeApi === undefined) {
      throw new Error('Expected the AltEditorLite Browser Global.');
    }

    const japaneseLanguage = localeApi.getLocale('ja');
    return {
      createLabel: japaneseLanguage?.actions.create,
      hasJQuery: 'jQuery' in globalThis,
      locale: japaneseLanguage?.locale,
      names: localeApi.getRegisteredLocaleNames(),
      registryApiTypes: [
        typeof localeApi.getLocale,
        typeof localeApi.getRegisteredLocaleNames,
        typeof localeApi.registerLocale,
      ],
    };
  });

  expect(localeState).toEqual({
    createLabel: '作成',
    hasJQuery: false,
    locale: 'ja',
    names: ['en', 'ja'],
    registryApiTypes: ['function', 'function', 'function'],
  });
});
