# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-07

### Added

- Mutually exclusive `dialog` and `inlineDoubleClick` Edit presentations, with
  Dialog Edit remaining the default.
- Single-cell Inline Edit with exact public DataTables target resolution, explicit
  field eligibility, keyboard navigation, validation, cancellation, and retry.
- Public Inline state and control methods, operation modes and targets, shared
  lifecycle hooks, and plain-text modal feedback for Inline failures.
- A live demonstration with separate Dialog and Inline employee tables plus an
  always-visible synchronous workflow table.

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
- Made the workflow example's rendered Priority selectable in both editing modes
  and synchronized the mode switch with editor and button state.

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
