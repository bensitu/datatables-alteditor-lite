# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.1] - 2026-08-22

### Changed

- Reduced local uniqueness validation to one record enumeration and refreshed
  cached record captures without repeated row-id scans.
- Kept visible keyboard focus on controls during inline editing and included
  Host and Standalone runtime modules in the existing coverage report.
- Applied a repository-level LF checkout policy for consistent formatting checks
  across supported development environments.
- Documented trusted dialog template markup and restricted external language
  resources to explicit relative or HTTP and HTTPS URLs without embedded credentials.

### Fixed

- Removed stale record-target mappings after row replacement and removal, and
  rejected Remove requests that mix DataTables selectors with opaque targets.
- Completed editor, Host, dialog, form, and inline cleanup even when one owned or
  consumer-provided cleanup action fails.
- Preserved associated field errors from change callbacks and distinguished
  caller cancellation from language request timeouts.
- Validated inline cell ownership and DOM type before focus or editing, and
  restored temporary focus attributes after unsuccessful focus attempts.

## [0.5.0] - 2026-08-21

### Added

- Added the host-neutral `EditorHost` contract and optional selection, refresh,
  record collection, and presentation capabilities.
- Added `DataTablesHost`, the selector-friendly `DataTablesEditor` facade, and
  the explicit `datatables-alteditor-lite/datatables` entry.
- Added `StandaloneHost`, an integrated consumer-owned record example, and ESM
  and Browser Global standalone distributions.
- Added repeatable package-boundary verification using a clean consumer without
  DataTables and bundled-output inspection.

### Changed

- Moved record application, draw completion, refresh, selection, inline targets,
  extension synchronization, ownership, and table event dispatch into the
  DataTables Host boundary.
- Made persistence complete before Host application and made Host application
  complete before success events and `afterSuccess` callbacks.
- Made `datatables.net` an optional peer at package level while preserving the
  supported DataTables 3 range and optional Buttons and Select peers.
- Kept the existing DataTables Browser Global distribution and retrieval-only
  `table.altEditorLite()` behavior, exposed `StandaloneHost` from that browser
  distribution, and separated neutral ESM imports.
- Standardized Browser Global filenames on the `alt-editor-lite` name while
  retaining the previously published main and language filenames as compatibility
  copies until 1.0.

### Fixed

- Suppressed success publication when a Host cannot apply a canonical result and
  retained the presentation for a retryable failure.
- Ensured destruction releases pending owned DataTables draws and standalone
  callbacks cannot access a destroyed Host.

### Breaking

- `AltEditorLite` now requires an `EditorHost`; the former
  `new AltEditorLite(table, options)` constructor was removed. Use
  `new DataTablesEditor(table, options)` or construct `DataTablesHost` explicitly.
- Removed `table` from `OperationContext`, `AfterSuccessContext`, and
  `FormValidationContext`. Retain a `DataTablesHost` and call `unwrap()` when
  application code intentionally requires the DataTables API.
- Replaced DataTables row and column information in neutral operation and event
  targets with the optional `key` and `fieldNames` shape.
- Removed `refreshTable()` in favor of `refresh()`.
- The neutral root no longer imports or auto-registers DataTables. DataTables
  applications must import `datatables-alteditor-lite/datatables`.
- Neutral methods accept opaque Host targets. Use `DataTablesEditor` when public
  DataTables row and column selectors are required.

## [0.4.1] - 2026-08-16

### Changed

- Reduced repeated row identity, inline navigation, pointer movement, form value
  collection, and SearchSelect option work for large tables and long-lived editors.
- Aligned development Node.js types with the minimum supported Node.js major
  version and stopped publishing declaration maps that referenced source files.
- Unified package stylesheet metadata on the exported unminified stylesheet.
- Documented language request defaults, application-owned operation timeouts,
  remote SearchSelect monitoring, and trusted resource configuration.

### Fixed

- Preserved unexpected field validator failures for operation error reporting
  instead of treating them as ordinary invalid input.
- Added runtime checks for the owned table and document body, and made dialog
  cleanup safe after editor destruction.
- Replaced dialog inline sizing with viewport-aware stylesheet rules for strict
  Content Security Policy environments.
- Defaulted external language requests to omit credentials and revalidate cached
  responses while retaining explicit Fetch API overrides.
- Restored the previous DataTables error mode after integration test cleanup.

## [0.4.0] - 2026-08-15

### Added

- Composable Dialog and Inline Edit capabilities that can be enabled together on
  one editor instance.
- Consumer-owned dialog form templates with validated field slots and cloned DOM
  content.
- Runtime field visibility, disabled, read-only, required, value, and choice-option
  updates through public field controllers.
- Dynamic options for Select, Radio, and SearchSelect fields with typed value
  preservation.
- Declarative field dependencies with immutable value snapshots, cancellation,
  stale-result protection, and atomic state updates.
- Typed form-level validation for Create, Dialog Edit, and Inline Edit.
- Configurable response-size limits for externally loaded language resources.

### Changed

- Replaced the single editing mode with nested `editing.dialog` and
  `editing.inline` configuration.
- Grouped SearchSelect query behavior under `search` and asynchronous option
  providers under `remote`.
- Made public `FieldController.getValue()` consistently return a `Promise` and
  added a dedicated choice-field controller contract.
- Standardized field configuration and runtime naming on `readOnly`.
- Separated dialog operations, inline sessions, form layout, dependencies, and
  validation into focused components while retaining shared lifecycle ownership.

### Fixed

- Kept field-level validation independent from active Dialog Create and Edit
  submissions, and reported callback `AbortError` failures unless the owning
  operation was actually cancelled.
- Released validation cancellation references after settlement, pruned detached
  remote SearchSelect option elements, and standardized timer access across
  reusable components.
- Preserved loaded SearchSelect results during keyboard navigation and made
  Escape cancel every active Inline cell edit without saving.

### Breaking

- Removed `editMode`; configure Dialog and Inline Edit through `editing`.
- Removed the top-level `inline` object; move its properties to `editing.inline`.
- Removed top-level `closeOnSuccess`; use `editing.dialog.closeOnSuccess`.
- Renamed the field property `readonly` to `readOnly`.
- Renamed library-owned CSS selectors from `.dt-alteditor-lite-*` to
  `.alteditor-lite-*` and custom properties from `--dt-alteditor-lite-*` to
  `--alteditor-lite-*`; generated editor-owned DOM identifiers now use the
  `alteditor-lite-*` prefix as well.
- Removed flattened SearchSelect `searchThreshold`, `debounceMs`, `loadOptions`,
  and `resolveOption`; use the nested `search` and `remote` objects.

## [0.3.1] - 2026-08-13

### Changed

- Consolidated complete-row callback validation and removed unused inline view
  construction state without changing the public API.
- Added maintained coexistence coverage for the DataTables 3 release lines of
  AutoFill, ColumnControl, Responsive, RowReorder, and SearchBuilder across
  extension operations, editing, and destruction.
- Synchronized ColumnControl SearchList options and Responsive layout calculations
  after successful CRUD presentation cleanup, including completed Inline teardown.

### Fixed

- Prevented overlapping programmatic Inline submissions from replacing an active
  save before value collection completed.
- Allowed configured KeyTable activation shortcuts to reach an active Inline
  session, preserving its keyboard actions.
- Enabled touch double-tap activation for `inlineDoubleClick` on phone and tablet
  layouts while preserving normal single-tap table interaction.
- Refined `inlineHover` controls for narrow columns, wrapped action layouts,
  temporal inputs, and SearchSelect popups while preserving cell borders and
  reducing action and pencil sizing across desktop and mobile layouts.
- Rejected unsupported runtime field types with a stable configuration error and
  limited incompatible hover-action messages to the options actually configured.
- Recursively froze array values supplied to inline callbacks and preserved the
  original focus target while asynchronous inline opening work was pending.
- Added subresource integrity metadata to the versioned DataTables extension
  assets used by the hosted demonstration.

## [0.3.0] - 2026-08-10

### Added

- Hover- and touch-discoverable single-cell editing with one cell-local pencil,
  native Submit and Cancel actions, and explicit session resolution.
- Configurable focused-cell keyboard activation through optional KeyTable, with
  F2 as the default shortcut and exact extension-state restoration.
- Live inline column mapping rebuilds after completed ColReorder operations.
- Remote SearchSelect loading and existing-value resolution with independent
  cancellation, stale-result protection, seed options, and accessible status.
- Mobile Chromium and mobile WebKit touch coverage and a combined hover,
  KeyTable, ColReorder, Select, and remote SearchSelect demonstration.

### Changed

- Composed inline activation, view, keyboard/focus behavior, and operation
  conflict policy per edit mode while retaining one shared Edit transaction.
- Preserved `dialog` as the default, existing `inlineDoubleClick` behavior, local
  SearchSelect configuration, optional DataTables extensions, and the no-jQuery
  runtime boundary.

## [0.2.1] - 2026-08-09

### Changed

- Published ESM entry points, declarations, and JSON languages under `dist/esm/`,
  with Browser Global scripts, styles, and language bundles under `dist/umd/`.
  Package metadata now identifies both the default jsDelivr script and stylesheet.
- Create, Remove, and Refresh now safely cancel an active Inline session before
  continuing instead of requiring a separate manual cancellation.
- Updated the live demonstration with separate Dialog and Inline employee tables,
  an always-visible rendered-control workflow table, coordinated side panels, and
  direct comparison between Inline and Dialog editing.
- Updated the development toolchain to ESLint 10.8.1 and Rolldown 1.2.3.

### Fixed

- Prevented stale Inline submissions, duplicate interaction release, late work
  after cancellation, unowned redraw mutations, selector-sensitive row lookup,
  and unresolved refresh ownership during destruction.
- Completed cancelled dialog and refresh lifecycles consistently, restored focus
  more reliably, handled dialog cancellation synchronously, and prevented alert
  presentation failures from leaving editing state busy.
- Isolated field change and validation cancellation by field, cleared stale form
  errors, localized validation fallbacks, and displayed field callback failures
  beside the affected control.
- Normalized finite decimal number values, preserved readonly and required radio
  semantics, cancelled related file reads after failure, and handled cyclic
  collected values safely.
- Improved SearchSelect filtering and active-option updates, removed stale ARIA
  state on destruction, and prevented duplicate descriptive references.
- Improved destructive-button contrast in dark color schemes and retained compact
  Inline input, checkbox, border, and row-height presentation.
- Rejected unsupported language resource URL schemes and malformed DataTables
  version metadata with stable public errors.
- Updated indirect development dependencies to js-yaml 4.3.1 and nanoid 3.3.18
  to incorporate their current availability safeguards.
- Corrected documentation, CDN examples, local Demo loading, Pages assembly, and
  browser tests for the current distribution paths and editing behavior.

## [0.2.0] - 2026-08-07

### Added

- Mutually exclusive `dialog` and `inlineDoubleClick` Edit presentations, with
  Dialog Edit remaining the default.
- Single-cell Inline Edit with exact public DataTables target resolution, explicit
  field eligibility, keyboard navigation, validation, cancellation, and retry.
- Public Inline state and control methods, operation modes and targets, shared
  lifecycle hooks, and plain-text modal feedback for Inline failures.

### Changed

- Unified Dialog and Inline Edit through the same non-optimistic persistence,
  target revalidation, row commit, draw ownership, event ordering, and error
  normalization path.
- Made editor buttons capability-aware: Dialog Edit is hidden in Inline mode, and
  all visible actions are disabled while an Inline session owns the table.
- Added `mode` and optional `target` information to operation callbacks and the
  existing lifecycle events without adding a separate Inline event family.
- Separated Inline activation, session, presentation, content ownership, and focus
  state responsibilities while retaining the public Inline API and CSS names.
- Removed the former Inline enablement and activation options. `editMode` now
  selects the complete Edit presentation, and an `inline` object is accepted only
  with `inlineDoubleClick`.

### Fixed

- Preserved or discarded rendered cell content safely across Inline completion,
  cancellation, redraw, destruction, and stale-target failures.
- Prevented active Inline sessions from being implicitly cancelled by Create,
  Remove, or Refresh; conflicting actions remain blocked until explicit submit or
  cancellation.
- Kept only the latest asynchronous field-change result and prevented stale
  failures or alert focus transfers from submitting or closing the current cell.
- Kept Inline inputs compact with one cell-level focus outline, a `1rem` checkbox,
  no nested text-control border, and a compact control height in the supplied
  stylesheet.

### Compatibility

- Existing configurations that omit `editMode` continue to use Dialog Edit.
- Buttons and Select remain supported. KeyTable receives post-draw focus when its
  public API is available. Responsive child cells, FixedColumns clone cells, and
  active ColReorder mutations are not Inline Edit targets.

## [0.1.1] - 2026-08-03

### Added

- Optional consumer-owned Refresh operations with cancellation signals for
  applications that require network-level request cancellation.
- A public API reference and explicit browser capability requirements.

### Changed

- Reused SearchSelect option elements during filtering and cached dialog focus
  targets until relevant content changes.
- Reduced local uniqueness validation overhead by avoiding full row-array copies
  and repeated field-path parsing.
- Added CSS fallbacks for dynamic viewport units and mixed system colors.

### Fixed

- Replaced unknown callback failures with localized generic messages while
  preserving explicitly constructed `AltEditorLiteError` instances.
- Preserved explicit `undefined` field values when reopening Edit forms.
- Ignored undefined inline language overrides, rejected non-JSON language
  responses with declared media types, and treated whitespace-only number values
  as empty.
- Removed an ineffective dialog backdrop handler and made the demonstration's
  date-time renderer tolerate missing values.

## [0.1.0] - 2026-08-02

### Added

- ✨ Initial public release. ✨
- Native Create, Edit, Remove, and Refresh workflows with synchronous client-side
  mappings or asynchronous persistence operations.
- Safe nested form values, typed fields, local uniqueness validation, operation
  cancellation, stable target snapshots, and normalized errors.
- Optional DataTables Buttons and Select integration, including explicit selector
  support and lifecycle-aware button enablement.
- Local single-value SearchSelect with typed string/number tokens, dynamic options,
  local filtering and sorting, manual strings, keyboard navigation, IME safety,
  and accessible combobox behavior.
- English, Japanese, Simplified Chinese, and Spanish JSON languages with ESM,
  Browser Global, inline configuration, and external JSON loading support.
- Responsive light and dark styles with reduced-motion and high-zoom support.
- Public documentation and a GitHub Pages-ready demonstration of the distribution
  files, optional extensions, localization, events, and error handling.

### Fixed

- Applied localized required-field messages consistently across every field type and
  restored compact, semantic checkbox presentation.
- Hardened external language loading, asynchronous validation cancellation, dialog
  focus management, and instance identity across multiple bundle formats.
- Recovered cleanly from form construction and source-population failures, rejected
  array-valued row callback results, and exposed opening failures through the error
  event.
- Associated radio descriptions with their accessible group and added conservative,
  overridable budgets for file fields that encode content as data URLs.
