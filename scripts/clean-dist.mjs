import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const outputDirectory = resolve(projectRoot, 'dist');

if (dirname(outputDirectory) !== projectRoot) {
  throw new Error('Refusing to clean an output directory outside the project root.');
}

await rm(outputDirectory, { recursive: true, force: true });
