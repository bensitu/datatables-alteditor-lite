# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-04

### Added

- Optional safe single-cell inline editing with exact public DataTables target
  resolution, explicit field eligibility, keyboard operation, validation,
  cancellation, retry, and accessible status feedback.
- Shared lifecycle hooks for open, submit, successful commit, and normalized error
  observation across dialog, inline, and programmatic operations.
- Public inline state and control methods, operation modes and targets, localized
  inline messages, integration guidance, migration notes, and a live example.

### Changed

- Unified dialog and inline Edit through the same non-optimistic persistence,
  target revalidation, row commit, draw ownership, event ordering, and error
  normalization path.
- Added `mode` and optional `target` context to operation callbacks and existing
  lifecycle events without adding a separate inline event family.

### Compatibility

- Inline editing is disabled by default and does not change existing dialog
  behavior until explicitly configured.
- Buttons and Select remain supported. KeyTable receives post-draw focus when its
  public API is available. Responsive child cells, FixedColumns clone cells, and
  active ColReorder mutations are not inline edit targets.

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
