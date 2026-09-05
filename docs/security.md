# Security

AltEditorLite treats configured labels, descriptions, option labels, validation
messages, and operation messages as plain text. It has no raw HTML renderer and
does not use `eval`, `new Function`, inline script generation, or `unsafe-eval`.

Native field attributes use an allowlist. Event-handler attributes such as
`onclick` are rejected. Field paths reject prototype-mutating segments, and the
default Edit merge writes only declared safe paths into new plain nested objects.

Only messages explicitly supplied through `AltEditorLiteError` are eligible for
display. Unknown exceptions use a localized generic message; raw stacks, response
bodies, and arbitrary serialized values are not rendered. External language
requests require a JSON media type when the server supplies `Content-Type`, and
have timeout and response-size limits. File count and byte budgets are checked
before data URL conversion.

Language resource URLs, dialog templates, and native `pattern` attributes are
trusted configuration. Applications should restrict language URLs with their own
origin policy and CSP, and can set `redirect: 'error'` when redirects are not
expected. Protocol-relative URLs and URLs containing embedded credentials are
rejected, as are URLs containing raw control characters. Dialog templates are
cloned without sanitization, so externally sourced markup must be sanitized before
configuration. Patterns should avoid expressions with excessive backtracking on
long input.

DOM nodes returned by `removeConfirmation` and custom field adapters are also
trusted application content. Use `textContent` for external values and sanitize
external markup before constructing those nodes. The editor does not sanitize
application-owned DOM.

File selectors and `accept` attributes do not establish trust. Servers must
validate uploaded content, size, and media type. Data URLs returned by file fields
must not be inserted into active HTML or executable frames without an
application-owned content policy.

These boundaries do not replace server controls. Servers must authenticate and
authorize every operation, validate all values and files, enforce uniqueness, and
apply concurrency protection. In particular, a client-side unique check cannot
guarantee uniqueness for server-side or concurrently changing datasets.

The Browser Global build has no jQuery dependency and supports a strict same-origin
Content Security Policy. See the root [Security Policy](../SECURITY.md) for private
vulnerability reporting.

Production pages that load scripts or styles from a CDN should pin exact versions
and provide independently verified Subresource Integrity metadata with anonymous
cross-origin loading, or self-host the exact assets. Embedding restrictions such
as CSP `frame-ancestors` must be delivered through an HTTP response header;
browser metadata cannot enforce that directive.
