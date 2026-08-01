import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = resolve(projectRoot, 'src/locales');
const outputDirectory = resolve(projectRoot, 'dist/locales');
const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
const localeFileNames = sourceEntries
  .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
  .map((entry) => entry.name)
  .sort();
const placeholderPattern = /\{[^{}]+\}/gu;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messagePlaceholders(message) {
  return [...message.matchAll(placeholderPattern)]
    .map(([placeholder]) => placeholder)
    .sort();
}

function assertCompleteLanguage(value, reference, fileName, parentPath = '') {
  if (!isRecord(value)) {
    throw new Error(`Language resource "${fileName}" must contain a JSON object.`);
  }

  for (const key of Object.keys(reference)) {
    const path = parentPath.length === 0 ? key : `${parentPath}.${key}`;
    if (!Object.hasOwn(value, key)) {
      throw new Error(`Language resource "${fileName}" is missing "${path}".`);
    }

    const nestedValue = value[key];
    const referenceValue = reference[key];
    if (typeof referenceValue === 'string') {
      if (typeof nestedValue !== 'string' || nestedValue.trim().length === 0) {
        throw new Error(
          `Language resource "${fileName}" value "${path}" must be a non-empty string.`,
        );
      }

      if (
        messagePlaceholders(referenceValue).join('\0') !==
        messagePlaceholders(nestedValue).join('\0')
      ) {
        throw new Error(
          `Language resource "${fileName}" value "${path}" must preserve its placeholders.`,
        );
      }
      continue;
    }

    assertCompleteLanguage(nestedValue, referenceValue, fileName, path);
  }

  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(reference, key)) {
      const path = parentPath.length === 0 ? key : `${parentPath}.${key}`;
      throw new Error(`Language resource "${fileName}" has unknown key "${path}".`);
    }
  }
}

async function readLanguageResource(fileName) {
  try {
    return JSON.parse(await readFile(resolve(sourceDirectory, fileName), 'utf8'));
  } catch (cause) {
    throw new Error(`Language resource "${fileName}" is not valid JSON.`, { cause });
  }
}

function localeExportName(fileName) {
  const localeName = fileName.slice(0, -'.json'.length);
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(localeName)) {
    throw new Error(`Invalid locale resource filename: "${fileName}".`);
  }

  return localeName.replaceAll(/-([a-z0-9])/gu, (_match, character) =>
    character.toUpperCase(),
  );
}

const englishResource = await readLanguageResource('en.json');
for (const fileName of localeFileNames) {
  const languageResource = await readLanguageResource(fileName);
  assertCompleteLanguage(languageResource, englishResource, fileName);

  let canonicalLocale;
  try {
    [canonicalLocale] = Intl.getCanonicalLocales(languageResource.locale);
  } catch (cause) {
    throw new Error(`Language resource "${fileName}" has an invalid locale.`, {
      cause,
    });
  }

  const localeName = fileName.slice(0, -'.json'.length);
  if (canonicalLocale === undefined || canonicalLocale.toLowerCase() !== localeName) {
    throw new Error(
      `Language resource "${fileName}" locale must match its lowercase filename.`,
    );
  }
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
  localeFileNames.flatMap((fileName) => {
    const localeName = fileName.slice(0, -'.json'.length);
    const exportName = localeExportName(fileName);
    const declaration = `import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

declare const language: Readonly<AltEditorLiteLanguage>;

export { language as ${exportName} };
export default language;
`;

    return [
      copyFile(resolve(sourceDirectory, fileName), resolve(outputDirectory, fileName)),
      writeFile(resolve(outputDirectory, `${localeName}.d.ts`), declaration),
    ];
  }),
);
