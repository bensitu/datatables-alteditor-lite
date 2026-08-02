# Security

AltEditorLite treats configured labels, descriptions, option labels, validation
messages, and operation messages as plain text. It has no raw HTML renderer and
does not use `eval`, `new Function`, inline script generation, or `unsafe-eval`.

Native field attributes use an allowlist. Event-handler attributes such as
`onclick` are rejected. Field paths reject prototype-mutating segments, and the
default Edit merge writes only declared safe paths into new plain nested objects.

Operation errors expose only validated own properties. Unknown exceptions use a
localized generic message; raw stacks and arbitrary serialized values are not
rendered. Untrusted displayed messages are length-bounded. External language
requests have timeout and response-size limits. File count and byte budgets are
checked before data URL conversion.

These boundaries do not replace server controls. Servers must authenticate and
authorize every operation, validate all values and files, enforce uniqueness, and
apply concurrency protection. In particular, a client-side unique check cannot
guarantee uniqueness for server-side or concurrently changing datasets.

The Browser Global build has no jQuery dependency and supports a strict same-origin
Content Security Policy. See the root [Security Policy](../SECURITY.md) for private
vulnerability reporting.
