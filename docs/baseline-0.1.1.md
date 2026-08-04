# Version 0.1.1 compatibility baseline

This record describes the repository state used as the compatibility reference for the 0.2.0 implementation. The reference commit is `86b9ecfb29cb6d41664d60aa0f546c05e5afae91` on the `develop` branch.

## Runtime and package checks

- `npm ci`: completed with 493 installed packages. The dependency scan reported one high-severity issue in the existing dependency graph.
- `npm run typecheck`: passed.
- `npm test`: passed with 28 files and 200 tests.
- `npm run test:coverage`: passed.
- `npm run build`: passed for the ESM bundle, browser-global bundle, CSS, locale resources, and declarations.
- `npm pack --dry-run --json`: passed with 180 package entries, a 347,361-byte archive, and 1,680,103 unpacked bytes.

The complete `npm run check` command stopped at `format:check` because 35 files in the reference commit do not match the installed Prettier version. No runtime check failed. The 0.2.0 work formats changed files and reports this inherited repository-wide formatting difference separately.

## Coverage

| Metric     | Result |
| ---------- | -----: |
| Statements | 92.57% |
| Branches   | 84.25% |
| Functions  | 95.57% |
| Lines      | 92.63% |

## Public package surface

The package provides:

- the ESM entry at `dist/index.js` with declarations at `dist/index.d.ts`;
- the browser-global entry at `dist/datatables-alteditor-lite.js` and its minified variant;
- the stylesheet export `datatables-alteditor-lite/style.css`;
- JSON and ESM locale resources through `datatables-alteditor-lite/locales/*`;
- optional peer integration with DataTables Buttons and Select.

The reference browser-global sizes are 174,778 bytes for the readable bundle and 77,411 bytes for the minified bundle. The reference CSS sizes are 9,717 bytes for the readable stylesheet and 8,065 bytes for the minified stylesheet.

## Compatibility behavior

The reference behavior includes dialog Create, Edit, and Remove operations, standalone refresh, request cancellation, stale-row protection, local uniqueness checks, safe declared-field merging, Buttons and Select integration, browser-global registration, and four locale resources.

The 0.2.0 implementation preserves these behaviors while adding inline editing and lifecycle context.
