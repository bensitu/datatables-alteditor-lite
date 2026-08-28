import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, '../..');
const dataTablesScriptPath = resolve(
  repositoryRoot,
  'node_modules/datatables.net/js/dataTables.js',
);
const browserBundlePath = resolve(repositoryRoot, 'dist/umd/alt-editor-lite.js');
const japaneseLocaleBundlePath = resolve(
  repositoryRoot,
  'dist/umd/locales/alt-editor-lite.ja.js',
);

test('requires the DataTables browser global to load first', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>');
  const pageErrorPromise = page.waitForEvent('pageerror');

  await page.addScriptTag({ path: browserBundlePath });

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain('DataTables must be loaded before AltEditorLite.');
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
      AltEditorLite?: {
        readonly Editor?: new (
          table: object,
          options: { readonly fields: readonly [] },
        ) => { destroy(): void };
      };
    };
    const dataTableConstructor = runtimeScope.DataTable;
    const editorConstructor = runtimeScope.AltEditorLite?.Editor;

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

test('runs a consumer-defined field through the public browser API', async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <body>
        <table id="custom-field-table">
          <thead><tr><th>Name</th></tr></thead>
        </table>
        <template id="custom-form-template">
          <section data-consumer-layout>
            <div data-alteditor-lite-field="name"></div>
          </section>
        </template>
      </body>
    </html>
  `);
  await page.addScriptTag({ path: dataTablesScriptPath });
  await page.addScriptTag({ path: browserBundlePath });

  await page.evaluate(async () => {
    interface ConsumerFieldContext {
      readonly language: { readonly locale: string };
      readonly onUserChange: () => void;
    }
    interface ConsumerFieldDefinition {
      createController(
        options: undefined,
        context: ConsumerFieldContext,
      ): Readonly<Record<string, unknown>>;
    }
    interface BrowserEditor {
      destroy(): void;
      openCreateDialog(): Promise<void>;
    }
    interface BrowserTable {
      destroy(): void;
    }
    interface BrowserRuntime {
      AltEditorLite?: {
        readonly Editor: new (
          table: BrowserTable,
          options: Readonly<Record<string, unknown>>,
        ) => BrowserEditor;
        defineCustomField(definition: ConsumerFieldDefinition): {
          field(config: Readonly<Record<string, unknown>>): unknown;
        };
      };
      DataTable?: new (
        selector: string,
        options: Readonly<Record<string, unknown>>,
      ) => BrowserTable;
      customFieldTest?: {
        readonly editor: BrowserEditor;
        readonly table: BrowserTable;
        readonly destroyedCount: () => number;
      };
    }

    const runtimeScope = globalThis as BrowserRuntime;
    const editorApi = runtimeScope.AltEditorLite;
    const dataTableConstructor = runtimeScope.DataTable;
    const template = document.querySelector<HTMLTemplateElement>('#custom-form-template');
    if (
      editorApi === undefined ||
      dataTableConstructor === undefined ||
      template === null
    ) {
      throw new Error('Expected the browser API and custom form template.');
    }

    let destroyedCount = 0;
    const textField = editorApi.defineCustomField({
      createController: (_options, context) => {
        const control = document.createElement('input');
        control.dataset['consumerControl'] = '';
        control.dataset['locale'] = context.language.locale;
        const handleInput = (): void => {
          context.onUserChange();
        };
        control.addEventListener('input', handleInput);
        return {
          control,
          destroy: () => {
            destroyedCount += 1;
            control.removeEventListener('input', handleInput);
          },
          focus: () => {
            control.focus();
          },
          getValue: () => control.value,
          setDisabled: (disabled: boolean) => {
            control.disabled = disabled;
          },
          setReadOnly: (readOnly: boolean) => {
            control.readOnly = readOnly;
          },
          setRequired: (required: boolean) => {
            control.required = required;
          },
          setValue: (value: string) => {
            control.value = value;
          },
          validate: () =>
            control.value.trim().length === 0
              ? { message: 'Enter a display name.', valid: false }
              : { valid: true },
        };
      },
    });
    const table = new dataTableConstructor('#custom-field-table', {
      columns: [{ data: 'name' }],
      data: [],
    });
    const editor = new editorApi.Editor(table, {
      clientSide: {
        createRow: (values: { readonly name?: string }) => ({
          name: values.name ?? '',
        }),
      },
      editing: { dialog: { template } },
      fields: [
        textField.field({
          defaultValue: '',
          label: 'Display name',
          name: 'name',
          required: true,
        }),
      ],
    });
    runtimeScope.customFieldTest = {
      destroyedCount: () => destroyedCount,
      editor,
      table,
    };
    await editor.openCreateDialog();
  });

  const dialog = page.getByRole('dialog');
  const control = dialog.getByLabel('Display name');
  await expect(dialog.locator('[data-consumer-layout]')).toBeVisible();
  await expect(control).toBeFocused();
  await expect(control).toHaveAttribute('data-locale', 'en');
  const accessibility = await new AxeBuilder({ page }).include('dialog').analyze();
  expect(
    accessibility.violations.filter(
      ({ impact }) => impact === 'serious' || impact === 'critical',
    ),
  ).toEqual([]);

  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(control).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Enter a display name.')).toBeVisible();

  await control.fill('Created in browser');
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Created in browser' })).toBeVisible();

  const destroyedCount = await page.evaluate(() => {
    const runtimeScope = globalThis as typeof globalThis & {
      customFieldTest?: {
        readonly editor: { destroy(): void };
        readonly table: { destroy(): void };
        readonly destroyedCount: () => number;
      };
    };
    const testState = runtimeScope.customFieldTest;
    if (testState === undefined) {
      throw new Error('Expected the consumer-defined field test state.');
    }
    testState.editor.destroy();
    testState.table.destroy();
    return testState.destroyedCount();
  });
  expect(destroyedCount).toBe(1);
});

test('requires the main browser bundle before a language bundle', async ({ page }) => {
  await page.setContent('<!doctype html><html><body></body></html>');
  const pageErrorPromise = page.waitForEvent('pageerror');

  await page.addScriptTag({ path: japaneseLocaleBundlePath });

  const pageError = await pageErrorPromise;
  expect(pageError.message).toContain(
    'The AltEditorLite browser bundle must be loaded before a language bundle.',
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
      AltEditorLite?: {
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
    const localeApi = runtimeScope.AltEditorLite;
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
