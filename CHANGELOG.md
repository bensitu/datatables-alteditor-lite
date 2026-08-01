# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-02

### Added

- Initial public release.
- Reproducible development, build, test, and continuous-integration foundations.
- Native Create dialog, safe form fields and nested values, synchronous
  `clientSide.createRow`, DataTables instance retrieval, lifecycle events, and
  English fallback text.
- Complete Create, Edit, Remove, and Refresh flows with asynchronous operation
  callbacks, cancellation ownership, stale-result protection, non-optimistic
  DataTables mutation, target snapshots, safe declared-field merging, mandatory
  Remove confirmation, and normalized operation errors.
- Optional DataTables Buttons and Select integration, including explicit selector
  fallbacks and lifecycle-aware button enablement.
- Local single-value SearchSelect with typed string/number tokens, dynamic options,
  local filtering and sorting, manual strings, keyboard navigation, IME safety,
  and complete combobox semantics.
- English, Japanese, Simplified Chinese, and Spanish locales with
  pure ESM subpaths and core-first Browser Global registration bundles.
- Final responsive light/dark stylesheet with reduced-motion, high-zoom, and
  SearchSelect states.
- Stable public documentation, public API examples, and a locally served Browser
  Global demo covering CRUD, optional extensions, locales, events, and failures.
- Local uniqueness validation for values in currently loaded DataTables rows and a
  public `EditorLanguageLoadError` contract for application-owned locale loaders.

### Fixed

- Localized Remove target counts and optional Buttons labels and tooltips across
  all published locales.
- Preserved explicit `undefined` clears in the built-in default Edit merge while
  continuing to omit disabled fields and public callback values.
- Kept the core ESM artifact readable and expanded coverage from a narrow critical
  subset to the complete core runtime while retaining the 100% critical gate.
- Updated the development and demo baseline to DataTables 3.0.1 and Buttons 4.0.1,
  and repaired the demo asset routes, CDN policy, and presentation.
