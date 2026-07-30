# Security Policy

## Supported versions

This project is not yet published. Security fixes are developed on the default
branch until the first supported release is available.

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
