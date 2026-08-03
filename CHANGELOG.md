# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
