import { readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, type Plugin, type RolldownOptions } from 'rolldown';

const peerPackageNames = [
  'datatables.net',
  'datatables.net-buttons',
  'datatables.net-select',
] as const;
const projectRoot = dirname(fileURLToPath(import.meta.url));
const localeDirectory = resolve(projectRoot, 'src/locales');
const localeNames = readdirSync(localeDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
  .map((entry) => entry.name.slice(0, -'.json'.length))
  .sort();

function localeExportName(localeName: string): string {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(localeName)) {
    throw new Error(`Invalid locale resource filename: "${localeName}.json".`);
  }

  return localeName.replaceAll(/-([a-z0-9])/gu, (_match, character: string) =>
    character.toUpperCase(),
  );
}

function createLocaleEntryPlugin(localeName: string, browserGlobal: boolean): Plugin {
  const entryId = `virtual:alteditor-lite-language:${localeName}:${browserGlobal ? 'browser' : 'esm'}`;
  const resolvedEntryId = `\0${entryId}`;
  const languageResourceId = `virtual:alteditor-lite-language-data:${localeName}`;
  const registrationModuleId = 'virtual:alteditor-lite-language-registration';

  return {
    name: `alteditor-lite-language-${localeName}-${browserGlobal ? 'browser' : 'esm'}`,
    resolveId(source) {
      if (source === entryId) {
        return resolvedEntryId;
      }
      if (source === languageResourceId) {
        return resolve(localeDirectory, `${localeName}.json`);
      }
      if (source === registrationModuleId) {
        return resolve(projectRoot, 'src/localization/register-browser-global-locale.ts');
      }
      return undefined;
    },
    load(id) {
      if (id !== resolvedEntryId) {
        return undefined;
      }

      if (browserGlobal) {
        return `
          import language from ${JSON.stringify(languageResourceId)};
          import { registerBrowserGlobalLocale } from ${JSON.stringify(registrationModuleId)};
          registerBrowserGlobalLocale(language);
        `;
      }

      const exportName = localeExportName(localeName);
      return `
        import language from ${JSON.stringify(languageResourceId)};
        export { language as default, language as ${exportName} };
      `;
    },
  };
}

function createEsmLocaleConfig(localeName: string): RolldownOptions {
  const entryId = `virtual:alteditor-lite-language:${localeName}:esm`;
  return {
    input: entryId,
    external: [...peerPackageNames],
    plugins: [createLocaleEntryPlugin(localeName, false)],
    output: {
      file: `dist/locales/${localeName}.js`,
      format: 'es',
      sourcemap: true,
    },
  };
}

function createBrowserGlobalLocaleConfig(
  localeName: string,
  isMinified: boolean,
): RolldownOptions {
  const entryId = `virtual:alteditor-lite-language:${localeName}:browser`;
  return {
    input: entryId,
    plugins: [createLocaleEntryPlugin(localeName, true)],
    output: {
      file: `dist/locales/datatables-alteditor-lite.${localeName}${isMinified ? '.min' : ''}.js`,
      format: 'iife',
      minify: isMinified,
      sourcemap: true,
    },
  };
}

const coreEsmConfig: RolldownOptions = {
  input: {
    index: 'src/index.ts',
  },
  external: [...peerPackageNames],
  output: {
    dir: 'dist',
    entryFileNames: '[name].js',
    format: 'es',
    sourcemap: true,
  },
};

const coreBrowserGlobalConfig: RolldownOptions = {
  input: 'src/browser-global.ts',
  output: {
    file: 'dist/datatables-alteditor-lite.js',
    format: 'iife',
    name: 'DataTablesAltEditorLite',
    sourcemap: true,
  },
};

const minifiedCoreBrowserGlobalConfig: RolldownOptions = {
  input: 'src/browser-global.ts',
  output: {
    file: 'dist/datatables-alteditor-lite.min.js',
    format: 'iife',
    minify: true,
    name: 'DataTablesAltEditorLite',
    sourcemap: true,
  },
};

export default defineConfig([
  coreEsmConfig,
  ...localeNames.map((localeName) => createEsmLocaleConfig(localeName)),
  coreBrowserGlobalConfig,
  minifiedCoreBrowserGlobalConfig,
  ...localeNames.flatMap((localeName) => [
    createBrowserGlobalLocaleConfig(localeName, false),
    createBrowserGlobalLocaleConfig(localeName, true),
  ]),
]);
