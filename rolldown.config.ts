import { defineConfig, type RolldownOptions } from 'rolldown';

const peerPackageNames = [
  'datatables.net',
  'datatables.net-buttons',
  'datatables.net-select',
] as const;
const localeNames = ['en', 'ja', 'zh-cn', 'es'] as const;

type LocaleName = (typeof localeNames)[number];

function createEsmLocaleConfig(localeName: LocaleName): RolldownOptions {
  return {
    input: `src/locales/${localeName}.ts`,
    external: [...peerPackageNames],
    output: {
      file: `dist/locales/${localeName}.js`,
      format: 'es',
      sourcemap: true,
    },
  };
}

function createBrowserGlobalLocaleConfig(
  localeName: LocaleName,
  isMinified: boolean,
): RolldownOptions {
  return {
    input: `src/browser-global-locales/${localeName}.ts`,
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
