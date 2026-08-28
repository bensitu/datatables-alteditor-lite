import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

// These gzip measurements come from the v0.6.1 build at commit a945eb4.
// JavaScript receives 3 KiB for typed custom fields and cancellable Host reads.
// CSS receives 256 bytes for small presentation fixes without hiding larger growth.
// ESM implementation code uses a content-named shared chunk, so the stable UMD
// main and Standalone files represent the complete shipping runtimes here.
const distributables = [
  {
    allowanceBytes: 3 * 1024,
    baselineBytes: 52_873,
    path: 'dist/umd/alt-editor-lite.min.js',
  },
  {
    allowanceBytes: 3 * 1024,
    baselineBytes: 34_851,
    path: 'dist/umd/alt-editor-lite-standalone.min.js',
  },
  {
    allowanceBytes: 256,
    baselineBytes: 2_815,
    path: 'dist/umd/alt-editor-lite.min.css',
  },
];

const failures = [];
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
  const maximumBytes = distributable.baselineBytes + distributable.allowanceBytes;
  const remainingBytes = maximumBytes - currentBytes;
  console.log(
    [
      distributable.path,
      `baseline=${String(distributable.baselineBytes)}`,
      `current=${String(currentBytes)}`,
      `maximum=${String(maximumBytes)}`,
      `remaining=${String(remainingBytes)}`,
    ].join(' '),
  );

  if (currentBytes > maximumBytes) {
    failures.push(
      `${distributable.path} exceeds its maximum by ${String(-remainingBytes)} bytes.`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(failures.join('\n'));
}
