import { execFileSync } from 'node:child_process';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'rolldown';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmExecutable = process.env['npm_execpath'];
if (npmExecutable === undefined) {
  throw new Error(
    'The npm executable path is unavailable. Run npm run verify:package from the project root.',
  );
}
const temporaryRoot = await mkdtemp(join(tmpdir(), 'datatables-alteditor-lite-package-'));
const localeDirectory = resolve(projectRoot, 'src/locales');
const localeFileNames = (await readdir(localeDirectory))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();
const localeResources = await Promise.all(
  localeFileNames.map(async (fileName) => ({
    name: fileName.slice(0, -'.json'.length),
    language: JSON.parse(await readFile(join(localeDirectory, fileName), 'utf8')),
  })),
);

function run(command, arguments_, workingDirectory) {
  execFileSync(command, arguments_, {
    cwd: workingDirectory,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

function runNpm(arguments_, workingDirectory) {
  return run(process.execPath, [npmExecutable, ...arguments_], workingDirectory);
}

async function assertMissing(path, message) {
  try {
    await access(path);
  } catch {
    return;
  }
  throw new Error(message);
}

async function bundleAndInspect(input, output) {
  await build({
    input,
    output: { file: output, format: 'es' },
    platform: 'browser',
  });
  const source = await readFile(output, 'utf8');
  for (const forbiddenText of [
    'datatables.net',
    'DataTablesHost',
    'registerAltEditorLite',
  ]) {
    if (source.includes(forbiddenText)) {
      throw new Error(
        `Neutral bundle unexpectedly contains ${JSON.stringify(forbiddenText)}.`,
      );
    }
  }
}

try {
  const packageDirectory = join(temporaryRoot, 'package');
  const consumerDirectory = join(temporaryRoot, 'consumer');
  await mkdir(packageDirectory);
  await mkdir(consumerDirectory);

  const packOutput = execFileSync(
    process.execPath,
    [
      npmExecutable,
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      packageDirectory,
    ],
    { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' },
  );
  const packResult = JSON.parse(packOutput);
  const packageFilename = packResult[0]?.filename;
  if (typeof packageFilename !== 'string') {
    throw new Error('npm pack did not return a package filename.');
  }
  const packagePath = join(packageDirectory, packageFilename);

  await writeFile(
    join(consumerDirectory, 'package.json'),
    JSON.stringify({ name: 'neutral-consumer', private: true, type: 'module' }),
  );
  runNpm(
    [
      'install',
      packagePath,
      '--ignore-scripts',
      '--omit=optional',
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
    ],
    consumerDirectory,
  );
  await assertMissing(
    join(consumerDirectory, 'node_modules', 'datatables.net'),
    'The neutral consumer unexpectedly installed datatables.net.',
  );

  const runtimeEntry = join(consumerDirectory, 'runtime.mjs');
  await writeFile(
    runtimeEntry,
    `
      import assert from 'node:assert/strict';
      import { AltEditorLite } from 'datatables-alteditor-lite';
      import { StandaloneHost } from 'datatables-alteditor-lite/standalone';
      if (typeof AltEditorLite !== 'function' || typeof StandaloneHost !== 'function') {
        throw new Error('Neutral runtime exports are unavailable.');
      }
      for (const { name, language } of ${JSON.stringify(localeResources)}) {
        const module = await import('datatables-alteditor-lite/locales/' + name);
        const json = await import('datatables-alteditor-lite/locales/' + name + '.json', {
          with: { type: 'json' },
        });
        const exportName = name.replaceAll(/-([a-z0-9])/gu, (_, character) => character.toUpperCase());
        assert.deepEqual(module.default, language);
        assert.equal(module[exportName], module.default);
        assert.deepEqual(json.default, language);
      }
    `,
  );
  run(process.execPath, [runtimeEntry], consumerDirectory);

  await writeFile(
    join(consumerDirectory, 'consumer.ts'),
    `
      import { AltEditorLite, type EditorHost } from 'datatables-alteditor-lite';
      import { StandaloneHost } from 'datatables-alteditor-lite/standalone';
      import type { AltEditorLiteLanguage } from 'datatables-alteditor-lite';
      ${localeResources
        .map(({ name }, index) => {
          const exportName = name.replaceAll(/-([a-z0-9])/gu, (_match, character) =>
            character.toUpperCase(),
          );
          return `import language${index}, { ${exportName} as namedLanguage${index} } from 'datatables-alteditor-lite/locales/${name}';
            const translations${index}: readonly Readonly<AltEditorLiteLanguage>[] = [language${index}, namedLanguage${index}];`;
        })
        .join('\n')}
      interface Row { readonly id: string; readonly name: string }
      const record: Row = { id: 'record', name: 'Example' };
      const host: EditorHost<Row, string> = new StandaloneHost({ read: () => record });
      const editor = new AltEditorLite(host, { fields: [] });
      editor.destroy();
    `,
  );
  await writeFile(
    join(consumerDirectory, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        lib: ['DOM', 'ES2023'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
        target: 'ES2023',
      },
      include: ['consumer.ts'],
    }),
  );
  run(
    process.execPath,
    [resolve(projectRoot, 'node_modules/typescript/bin/tsc')],
    consumerDirectory,
  );

  const neutralBundleEntry = join(consumerDirectory, 'neutral-bundle.mjs');
  await writeFile(
    neutralBundleEntry,
    `
      import { AltEditorLite } from 'datatables-alteditor-lite';
      globalThis.NeutralEditor = AltEditorLite;
    `,
  );
  await bundleAndInspect(
    neutralBundleEntry,
    join(consumerDirectory, 'neutral-bundle.js'),
  );

  const standaloneBundleEntry = join(consumerDirectory, 'standalone-bundle.mjs');
  await writeFile(
    standaloneBundleEntry,
    `
      import { AltEditorLite, StandaloneHost } from 'datatables-alteditor-lite/standalone';
      globalThis.StandaloneEditor = { AltEditorLite, StandaloneHost };
    `,
  );
  await bundleAndInspect(
    standaloneBundleEntry,
    join(consumerDirectory, 'standalone-bundle.js'),
  );

  console.log('Package boundaries verified without DataTables.');
} finally {
  const resolvedTemporaryRoot = await realpath(temporaryRoot);
  const resolvedSystemTemporaryRoot = await realpath(tmpdir());
  const pathFromSystemTemporaryRoot = relative(
    resolvedSystemTemporaryRoot,
    resolvedTemporaryRoot,
  );
  if (
    pathFromSystemTemporaryRoot.length === 0 ||
    pathFromSystemTemporaryRoot.startsWith('..')
  ) {
    process.stderr.write('Refusing to remove an unexpected verification directory.\n');
    process.exitCode = 1;
  } else {
    await rm(resolvedTemporaryRoot, { force: true, recursive: true });
  }
}
