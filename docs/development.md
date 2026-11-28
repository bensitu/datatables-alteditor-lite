# Development

## Runtime and dependencies

Development and npm installation use Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`,
as declared in `package.json`. CI tests the minimum supported Node.js 22 and 24
versions and the current Node.js 26 release. Node.js 24 runs coverage and browser
tests.

Git 2.32 or newer is required for the development commit hooks.

Run `npm outdated` before updating dependencies. Check both the package's Node.js
engine requirement and the peer requirements of the complete toolchain.
Keep the lockfile and demonstration CDN versions aligned with dependency changes;
recompute integrity hashes from the exact CDN resources.

The npm override pins minimatch to 11.0.4 to address the glob-pattern amplification
advisory. The import lint plugin's default entry still imports the removed
`makeRe` API, so the ESLint configuration loads only its three enabled rules
through exported rule paths. All configured import checks remain enabled. Review
the override and rule imports together when upstream tools support minimatch 11.
The loaded rules use the installed plugin version; loading individual rules does
not pin separate implementations. Restoring the complete plugin import requires
its entry point and every eagerly imported rule to support the pinned minimatch
version.

### DataTables compatibility

Match extension releases to their DataTables core dependency. Buttons and Select
4.1 and the 3.1 releases of KeyTable and ColReorder require DataTables 3.1.
Use DataTables 3.1 and matching extensions when importing the DataTables entry in
a windowless Node.js environment. Creating an editor requires a browser DOM.

The lockfile resolves the following development versions. The main demo pins the
same versions for the extensions it loads from the CDN; other extensions are
exercised by npm-based integration tests.

| Package                                                          | Locked npm version | Main demo CDN version |
| ---------------------------------------------------------------- | ------------------ | --------------------- |
| [DataTables](https://cdn.datatables.net/3.1.6/)                  | 3.1.6              | 3.1.6                 |
| [AutoFill](https://cdn.datatables.net/autofill/3.1.3/)           | 3.1.3              | Not loaded            |
| [Buttons](https://cdn.datatables.net/buttons/4.1.4/)             | 4.1.4              | 4.1.4                 |
| [ColReorder](https://cdn.datatables.net/colreorder/3.1.2/)       | 3.1.2              | 3.1.2                 |
| [ColumnControl](https://cdn.datatables.net/columncontrol/2.1.3/) | 2.1.3              | Not loaded            |
| [FixedHeader](https://cdn.datatables.net/fixedheader/5.1.2/)     | 5.1.2              | Not loaded            |
| [KeyTable](https://cdn.datatables.net/keytable/3.1.2/)           | 3.1.2              | 3.1.2                 |
| [Responsive](https://cdn.datatables.net/responsive/4.1.1/)       | 4.1.1              | Not loaded            |
| [RowReorder](https://cdn.datatables.net/rowreorder/2.1.1/)       | 2.1.1              | Not loaded            |
| [Scroller](https://cdn.datatables.net/scroller/3.1.1/)           | 3.1.1              | Not loaded            |
| [SearchBuilder](https://cdn.datatables.net/searchbuilder/2.1.1/) | 2.1.1              | Not loaded            |
| [Select](https://cdn.datatables.net/select/4.1.1/)               | 4.1.1              | 4.1.1                 |

Existing integration tests exercise installed extensions, host record updates,
selection and redraw behavior. Browser tests exercise keyboard editing and
column reordering against the demonstration's CDN resources. Browser test workers
reuse downloaded versioned resources and retry interrupted transfers up to twice
without altering their contents. Recompute page integrity hashes whenever CDN
versions change. Public peer ranges remain unchanged.

DataTables record enumeration creates one detached snapshot for each visited row
and reuses it for the row value and record target. Local uniqueness checks stop
once all supplied unique values have duplicates. Row values are read during
iteration rather than cached across draws, so external row replacements remain
visible. Redraw cleanup counts only retained row identifiers, but still scans all
loaded identifiers to detect duplicates reliably.

## Internal responsibilities

The AG Grid entry accepts the public grid API through a structural interface.
The integration suite exercises the installed AG Grid runtime. The packaged
consumer check also compiles a real `GridApi<TRow>` against the published
declarations. Consumers of the neutral entries can install the editor
independently of either grid peer.

- The editor entry implementation assembles host capabilities, configuration,
  and editing controllers. Core modules provide host-independent operation,
  cancellation, validation, and state logic. Shared field and form types live
  in `src/contracts/`.
- `DialogEditingController` coordinates operation selection, session resources,
  state transitions and submission presentation.
- `DialogOpenCoordinator` owns cancellable reads and opening hooks. Dialog and
  inline editing both use shared dialog presentation components.
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
  The DataTables record target registry maintains row identity across redraws.
- SearchSelect keeps listbox rendering, the active option, and popup positioning
  together. The widget owns selected values and local or remote option requests.

Keep asynchronous ownership checks adjacent to presentation changes. Initializing
fields must finish before a dialog is shown, and cancelled work must not activate
or clean up a newer session. Batch operation targets share an immutable field-name
list calculated once per opening.

## Adding reference examples

The table integrations have separate pages in `examples/demo/tables/`. Each
page pins its own external assets and integrity metadata. Local and Pages
examples use the same document Content Security Policy. When changing a vendor
version, verify both the asset integrity and any hashes for styles the library
inserts. The AG Grid page uses external theme styles and the no-style browser
bundle. The Plotly page uses the strict distribution.

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
Coverage includes the root package entry modules as well as implementation
directories; declaration files are excluded.

Keep new tests focused on observable behavior and supported workflows. Reuse the
existing form, lifecycle, extension and example suites rather than introducing
checks tied to source layout. Distribution size limits are defined in
`scripts/check-bundle-size.mjs`.

## Publishing

Workflows pin GitHub Actions to commits from their upstream repositories. Keep
the release tag comment aligned with the commit when updating a workflow.

The npm workflow publishes the verified artifact attached to a published GitHub
release. It uses OpenID Connect (OIDC) authentication on a GitHub-hosted runner and
does not provide a long-lived npm publishing token.
The publishing workflow installs a specific npm CLI version for repeatable runs.

Before running it, configure a trusted publisher in the npm package settings for
owner `bensitu`, repository `datatables-alteditor-lite`, workflow filename
`publish-npm.yml`, and environment `npm`. Allow direct `npm publish` operations.
Fork maintainers must configure their own package and repository identity. The
workflow's `id-token: write` permission enables credential exchange; it does not
create the npm account configuration. See the
[npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/).

Run `draft-release.yml` from the default branch for the version already recorded
in `package.json` and the changelog. Review and publish the resulting GitHub
release, then run `publish-npm.yml` with the same version and distribution tag.
After a successful trusted publication, remove unused publishing tokens from the
package's account and repository settings.
