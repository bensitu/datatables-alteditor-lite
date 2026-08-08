import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, '.pages');
const distributionDirectory = resolve(projectRoot, 'dist');
const demoDirectory = resolve(projectRoot, 'examples/demo');
const demoAssetPaths = [
  'data/employees.json',
  'demo.css',
  'demo.js',
  'favicon.ico',
  'index.html',
];
if (dirname(outputDirectory) !== projectRoot) {
  throw new Error('Refusing to replace a Pages directory outside the project root.');
}

await rm(outputDirectory, { force: true, recursive: true });
await Promise.all([
  mkdir(outputDirectory, { recursive: true }),
  mkdir(resolve(outputDirectory, 'examples/demo/data'), { recursive: true }),
  mkdir(resolve(outputDirectory, 'examples/demo'), { recursive: true }),
]);
await Promise.all([
  cp(distributionDirectory, resolve(outputDirectory, 'dist'), { recursive: true }),
  ...demoAssetPaths.map((assetPath) =>
    copyFile(
      resolve(demoDirectory, assetPath),
      resolve(outputDirectory, 'examples/demo', assetPath),
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
