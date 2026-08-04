# Version 0.2.0 release verification

This record summarizes the final package and compatibility checks for version
0.2.0. Size comparisons use the published 0.1.1 package and the locally built
0.2.0 package so gzip results use consistent artifacts.

## Bundle sizes

| Artifact                | 0.1.1 raw | 0.1.1 gzip | 0.2.0 raw | 0.2.0 gzip | Gzip change |
| ----------------------- | --------: | ---------: | --------: | ---------: | ----------: |
| ESM `index.js`          |   168,611 |     35,235 |   230,954 |     47,581 |      35.04% |
| Browser Global readable |   174,778 |     35,793 |   238,675 |     48,292 |      34.92% |
| Browser Global minified |    77,411 |     19,585 |   114,418 |     27,614 |      41.00% |
| CSS readable            |     9,336 |      1,921 |    11,082 |      2,187 |      13.85% |
| CSS minified            |     8,065 |      1,791 |     9,327 |      1,952 |       8.99% |

The minified Browser Global gzip result exceeds the 35% review target. The ESM
and readable Browser Global results remain at approximately 35%, and CSS remains
well below its 25% target. The increase comes from the optional inline controller,
shared edit ownership and commit logic, lifecycle hooks, runtime configuration
validation, and localized messages. The implementation adds no runtime dependency,
and these capabilities share the main editor lifecycle, so separating them would
introduce an additional loading and registration contract. The size result is
therefore recorded as an accepted review exception for this release.

## Package contents

`npm pack --dry-run --json` completed with 220 entries, a 469,669-byte archive,
and 2,302,597 unpacked bytes. The package contains the ESM and Browser Global
entries, declarations, styles, four locale resources, README, license, and
changelog. It does not bundle DataTables, Buttons, Select, jQuery, or another UI
runtime.

## Compatibility boundaries

- Existing dialog behavior remains the default; inline editing requires both
  editor enablement and explicit field eligibility.
- Buttons and Select use the same public integration behavior as version 0.1.1.
- KeyTable receives logical post-draw focus through its public `cell().focus()`
  method when present.
- Responsive child cells and FixedColumns clone cells are not inline targets.
- Column visibility changes, column reorder events, and unrelated draws safely
  cancel an active inline presentation.
- Scroller can rebuild cells during draw, so active inline work is cancelled and
  applications should verify their redraw frequency and row identity settings.
- Server-side tables should configure a stable `rowId`; refresh commit mode is
  available when the server is the canonical row source.

## Completed checks

- ESLint and Stylelint passed with no warnings.
- TypeScript source checking and public declaration tests passed.
- Unit and integration coverage passed with 232 tests across 30 files.
- Coverage results were 89.30% statements, 80.35% branches, 94.31% functions,
  and 89.45% lines.
- The ESM, Browser Global, CSS, locale, and declaration builds passed.
- All 57 Playwright tests passed in Chromium, Firefox, and WebKit, including
  inline keyboard navigation and accessibility checks.

The repository-wide Prettier check continues to report formatting differences in
18 unchanged files that were already present in the 0.1.1 reference state.
Changed 0.2.0 files pass the installed formatter. Those unrelated files are left
unchanged to keep this release focused on the requested behavior.
