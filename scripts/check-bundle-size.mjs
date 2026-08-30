import { appendFile, readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const distributables = [
  {
    maximumBytes: 56_448,
    path: 'dist/umd/alt-editor-lite.min.js',
  },
  {
    maximumBytes: 38_402,
    path: 'dist/umd/alt-editor-lite-standalone.min.js',
  },
  {
    maximumBytes: 3_087,
    path: 'dist/umd/alt-editor-lite.min.css',
  },
];

const failures = [];
const results = [];
console.log('Compressed distributable sizes (bytes):');

for (const distributable of distributables) {
  let source;
  try {
    source = await readFile(distributable.path);
  } catch (cause) {
    throw new Error(
      `Cannot read ${distributable.path}. Run npm run build before npm run check:size.`,
      { cause },
    );
  }

  const currentBytes = gzipSync(source, { level: 9 }).byteLength;
  const remainingBytes = distributable.maximumBytes - currentBytes;
  results.push({
    currentBytes,
    maximumBytes: distributable.maximumBytes,
    path: distributable.path,
    remainingBytes,
  });
  console.log(
    [
      distributable.path,
      `current=${String(currentBytes)}`,
      `maximum=${String(distributable.maximumBytes)}`,
      `remaining=${String(remainingBytes)}`,
    ].join(' '),
  );

  if (currentBytes > distributable.maximumBytes) {
    failures.push(
      `${distributable.path} exceeds its maximum by ${String(-remainingBytes)} bytes.`,
    );
  }
}

const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
if (summaryPath !== undefined && summaryPath.length > 0) {
  const summary = [
    '## Compressed bundle sizes',
    '',
    '| Artifact | Current | Maximum | Remaining | Status |',
    '| --- | ---: | ---: | ---: | --- |',
    ...results.map(
      (result) =>
        `| \`${result.path}\` | ${String(result.currentBytes)} | ${String(result.maximumBytes)} | ${String(result.remainingBytes)} | ${result.remainingBytes < 0 ? 'Exceeded' : 'Within limit'} |`,
    ),
    '',
  ].join('\n');
  await appendFile(summaryPath, summary, 'utf8');
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}
