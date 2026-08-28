## Summary

Describe the user-visible or contributor-visible outcome and the affected public
surfaces.

## Affected surfaces

- [ ] Host-neutral core and host contracts
- [ ] DataTables adapter
- [ ] Standalone host
- [ ] Browser distributions, locales, or styles
- [ ] Documentation, tooling, or dependencies

## Compatibility

Confirm the applicable statements and explain any intentional exception.

- [ ] Root and standalone entry points remain usable without DataTables.
- [ ] DataTables integration uses documented public APIs only.
- [ ] DataTables extensions remain optional runtime integrations.
- [ ] Host-neutral hooks, events, and targets do not expose DataTables-specific APIs.
- [ ] Standalone record state remains consumer-owned.
- [ ] No jQuery or third-party UI runtime dependency was introduced.

## Verification

- [ ] Relevant automated checks pass.
- [ ] New or changed behavior has a durable regression test where appropriate.
- [ ] Compressed bundle limits pass when distributable code or styles change.
- [ ] Package boundaries pass when entry points, bundles, or dependencies change.
- [ ] Public documentation is updated when behavior or configuration changes.

## Additional notes

Document compatibility considerations, deferred work, or intentionally omitted checks.
