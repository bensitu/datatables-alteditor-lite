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
        <table id="browser-table">
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

  const beforeLoadState = await page.evaluate(() => {
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

  expect(beforeLoadState).toMatchObject({
    dataTableType: 'function',
    hasJQuery: false,
  });
  expect(typeof beforeLoadState.dataTableVersion).toBe('string');

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

    const table = new dataTableConstructor('#browser-table');
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
    ...beforeLoadState,
    isGetterMatchedToSecondBundleInstance: true,
  });
});

test('requires the main browser bundle before a language bundle', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>');
  const pageErrorPromise = page.waitForEvent('pageerror');

  await page.addScriptTag({ path: japaneseLocaleBundlePath });

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain(
    'The DataTablesAltEditorLite browser bundle must be loaded before a language bundle.',
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
    createLabel: '新規',
    hasJQuery: false,
    locale: 'ja',
    names: ['en', 'ja'],
    registryApiTypes: ['function', 'function', 'function'],
  });
});
