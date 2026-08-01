import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, '.pages');
const distributionDirectory = resolve(projectRoot, 'dist');
const demoDirectory = resolve(projectRoot, 'examples/demo');
const demoFileNames = ['demo.css', 'demo.js', 'index.html'];
if (dirname(outputDirectory) !== projectRoot) {
  throw new Error('Refusing to replace a Pages directory outside the project root.');
}

await rm(outputDirectory, { force: true, recursive: true });
await Promise.all([
  mkdir(resolve(outputDirectory, 'dist/locales'), { recursive: true }),
  mkdir(resolve(outputDirectory, 'examples/demo'), { recursive: true }),
]);
const localeFileNames = (await readdir(resolve(distributionDirectory, 'locales')))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
await Promise.all([
  copyFile(
    resolve(distributionDirectory, 'alt-editor-lite.css'),
    resolve(outputDirectory, 'dist/alt-editor-lite.css'),
  ),
  copyFile(
    resolve(distributionDirectory, 'datatables-alteditor-lite.js'),
    resolve(outputDirectory, 'dist/datatables-alteditor-lite.js'),
  ),
  ...demoFileNames.map((fileName) =>
    copyFile(
      resolve(demoDirectory, fileName),
      resolve(outputDirectory, 'examples/demo', fileName),
    ),
  ),
  ...localeFileNames.map((fileName) =>
    copyFile(
      resolve(distributionDirectory, 'locales', fileName),
      resolve(outputDirectory, 'dist/locales', fileName),
    ),
  ),
]);
await Promise.all([
  writeFile(resolve(outputDirectory, '.nojekyll'), ''),
  writeFile(
    resolve(outputDirectory, 'index.html'),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./examples/demo/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AltEditorLite demonstration</title>
  </head>
  <body>
    <p><a href="./examples/demo/">Open the AltEditorLite demonstration</a></p>
  </body>
</html>
`,
  ),
]);
