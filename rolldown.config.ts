import { defineConfig } from 'rolldown';

export default defineConfig([
  {
    input: {
      index: 'src/index.ts',
    },
    external: ['datatables.net', 'datatables.net-buttons', 'datatables.net-select'],
    output: {
      dir: 'dist',
      format: 'es',
      sourcemap: true,
      entryFileNames: '[name].js',
    },
  },
  {
    input: 'src/browser-global.ts',
    output: {
      file: 'dist/datatables-alteditor-lite.js',
      format: 'iife',
      name: 'DataTablesAltEditorLite',
      sourcemap: true,
    },
  },
  {
    input: 'src/browser-global.ts',
    output: {
      file: 'dist/datatables-alteditor-lite.min.js',
      format: 'iife',
      name: 'DataTablesAltEditorLite',
      sourcemap: true,
      minify: true,
    },
  },
]);
