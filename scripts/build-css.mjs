import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transform } from 'lightningcss';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const sourcePath = resolve(projectRoot, 'src/styles/alt-editor-lite.css');
const outputDirectory = resolve(projectRoot, 'dist/umd');
const outputPath = resolve(outputDirectory, 'alt-editor-lite.css');
const minifiedOutputPath = resolve(outputDirectory, 'alt-editor-lite.min.css');
const mapOutputPath = resolve(outputDirectory, 'alt-editor-lite.min.css.map');
const sourceCss = await readFile(sourcePath);
const minifiedResult = transform({
  filename: sourcePath,
  code: sourceCss,
  minify: true,
  sourceMap: true,
});

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, sourceCss);
await writeFile(minifiedOutputPath, minifiedResult.code);
if (minifiedResult.map) {
  await writeFile(mapOutputPath, minifiedResult.map.toString());
}
