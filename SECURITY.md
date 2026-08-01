# Security Policy

## Supported versions

The latest 0.1.x release receives security fixes. Older pre-release revisions and
unsupported DataTables major versions do not receive fixes. See the package
metadata for the supported DataTables and Node ranges.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository maintainers.
Do not open a public issue containing exploit details, credentials, personal data,
or other sensitive information.

Include the affected revision, a minimal reproduction, impact, and any suggested
mitigation. Maintainers will acknowledge a report, investigate it, and coordinate
disclosure when a fix is available.

## Security boundaries

The project uses documented DataTables APIs, renders configured text without raw
HTML, and does not require jQuery or a third-party UI runtime. Browser input
constraints are usability features and are not substitutes for server-side
validation.

Field attributes are allowlisted, unsafe object-path segments are blocked, and
operation errors are normalized before display. SearchSelect is local-only and
enforces a 5,000-option ceiling. File budgets are checked before data URL reads.
Applications remain responsible for authentication, authorization, server-side
validation, file inspection, uniqueness, and concurrency controls.
