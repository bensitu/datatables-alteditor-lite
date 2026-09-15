# Development

## Runtime and dependencies

Development supports Node.js 20.19, 22.13, and 24 or newer, as declared in
`package.json`. CI tests the minimum supported Node.js 20 and 22 versions and
uses Node.js 24 for coverage, browser tests, and release artifacts.

Run `npm outdated` before updating dependencies. Check both the package's Node.js
engine requirement and the peer requirements of the complete toolchain.
Keep the lockfile and demonstration CDN versions aligned with dependency changes;
recompute integrity hashes from the exact CDN resources.

The current compatible toolchain retains:

- TypeScript 6.0.3: typescript-eslint 8.70 requires TypeScript below 6.1.
- Vitest and its coverage provider 4.1.11: version 5 requires Node.js 22.12 or newer.
- jsdom 29.1.1: version 30 requires Node.js 22.22.2 or newer.
- commitlint 20.5.3 and lint-staged 16.4.0: their next major versions require Node.js 22.
- Node.js 20 type declarations, matching the minimum supported runtime family.

### DataTables compatibility

The current development dependency updates include:

| Package                                                          | Version | Relevant upstream changes                                                      |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| [DataTables](https://cdn.datatables.net/3.0.4/)                  | 3.0.4   | Ajax column sizing, defaults merging, complex header selection and ordering    |
| [AutoFill](https://cdn.datatables.net/autofill/3.0.1/)           | 3.0.1   | DataTables configuration type declarations                                     |
| [Buttons](https://cdn.datatables.net/buttons/4.0.3/)             | 4.0.3   | Keyboard activation and language option declarations                           |
| [ColReorder](https://cdn.datatables.net/colreorder/3.0.2/)       | 3.0.2   | State restoration and configuration declarations                               |
| [ColumnControl](https://cdn.datatables.net/columncontrol/2.0.2/) | 2.0.2   | Column reordering interaction, dark theme controls and option declarations     |
| [Responsive](https://cdn.datatables.net/responsive/4.0.3/)       | 4.0.3   | Control column offsets that could hide row data                                |
| [SearchBuilder](https://cdn.datatables.net/searchbuilder/2.0.1/) | 2.0.1   | Localized date searches, delayed search behavior and DataTables 3 declarations |

Existing integration tests exercise installed extensions, host record updates,
selection and redraw behavior. Browser tests exercise keyboard editing and
column reordering against the demonstration's CDN resources. Browser test workers
reuse downloaded versioned resources and retry interrupted transfers up to twice;
resource contents and page integrity checks remain unchanged. Public peer ranges
remain unchanged.

## Internal responsibilities

- `DialogEditingController` coordinates operation selection, session resources,
  state transitions and submission presentation.
- `DialogOpenCoordinator` owns cancellable reads and opening hooks.
  `DialogCloseCoordinator` owns asynchronous closing decisions, coalesces repeated
  requests, and invalidates decisions when forms change or submission begins.
- `createFormView` creates the shared form element, layout and submission error
  region. Layout implementations clone and validate templates and mount fields;
  they do not own field values or validation.
- `FieldRuntimeController` applies visibility, disabled, read-only and required
  state, and supplies shared public field adaptation. Ordinary forms and batch
  bindings supply their own mutation, validation, error and destruction behavior.
- Host adapters own record access and application of committed results. Dialog
  and form code use host contracts without depending on DataTables internals.

Keep asynchronous ownership checks adjacent to presentation changes. Initializing
fields must finish before a dialog is shown, and cancelled work must not activate
or clean up a newer session. Batch operation targets share an immutable field-name
list calculated once per opening.

## Adding reference examples

Add a section to `examples/demo/reference.html` with a stable identifier and a
labelled heading, then add a matching anchor to its example navigation. Keep the
section structure consistent: a short description, labelled inputs where needed,
`.reference-actions`, and a `.reference-result-title` followed by a labelled
`output`. Results should describe application records after successful persistence.

Use the existing colors from `demo.css` and reusable rules in `reference.css`.
The navigation is sticky on desktop and wraps above the examples on narrow
screens. Preserve keyboard focus indicators, disabled control states and native
form semantics. Use scoped selectors in example scripts and destroy owned editors
on page exit. Register new demonstration assets in `scripts/build-pages.mjs`.

## Verification

Run `npm run check` for formatting, static analysis, maintained regression tests,
coverage, builds, compressed sizes, package boundaries, public declarations and
browser tests. Install the supported Playwright browsers before running the
browser suite. Use `npm run build:pages` to verify the deployable example tree.

Keep new tests focused on observable behavior and supported workflows. Reuse the
existing form, lifecycle, extension and example suites rather than introducing
checks tied to source layout. Distribution size limits are defined in
`scripts/check-bundle-size.mjs`.
