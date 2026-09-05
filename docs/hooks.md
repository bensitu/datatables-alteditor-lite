# Lifecycle hooks

Five optional lifecycle hooks extend the operation lifecycle. DOM events remain
non-cancelable observation points.

```ts
const editor = new AltEditorLite(table, {
  fields,
  hooks: {
    beforeOpen(context) {
      if (context.mode === 'inline' && context.row?.locked) {
        return false;
      }
    },
    beforeSubmit(values, context) {
      if (context.mode === 'inline' && values.rank === 13) {
        return false;
      }
    },
    beforeClose({ dirty }) {
      if (!dirty) {
        return;
      }
      return window.confirm('Discard unsaved changes?');
    },
    async afterSuccess(context) {
      await updateRelatedView(context);
    },
    onError(error, context) {
      reportError(error, context);
    },
  },
});
```

## Context

Operation contexts include an `AbortSignal`, the operation, the initiating mode
(`dialog`, `inline`, or `api`), and an optional neutral Edit target. A target
contains an optional Host key and the affected field paths. Contexts never
contain a DataTables API; retain a `DataTablesHost` and call `unwrap()` when a
hook deliberately needs one.

The `batchEdit` branches are explicit. `beforeOpen` receives ordered `originals`
and `targets`; `beforeSubmit` receives override-only changes plus the originals;
`afterSuccess` receives the changes, originals, canonical rows, and targets.
Applications can narrow on `context.operation === 'batchEdit'` without probing
optional single-record properties.

## beforeOpen

`beforeOpen(context)` runs before a dialog or inline control is added to the DOM.
Return `false` to decline opening without publishing open or close. An asynchronous
hook is cancellable through `context.signal`. For record operations, the hook
receives detached snapshots captured immediately before invocation. After the
hook resolves, the affected targets are read again; the refreshed snapshots
populate Edit forms and provide the rows used by Remove submission.

## beforeSubmit

`beforeSubmit(values, context)` runs after native, custom, and local uniqueness
validation. Plain objects and arrays in `values` are recursively frozen, while
browser host objects such as `File` retain their normal identity. Return `false`
to keep the presentation open without publishing submit or calling persistence.

This freezing applies to plain data containers, not mutable methods on `Date`,
`Map`, `Set`, or custom class instances. Treat all supplied values as read-only.

The hook is veto-only: it cannot return replacement values and cannot bypass validation.

## beforeClose

`beforeClose(context)` runs for Cancel, Escape, and `closeDialog()` while an
ordinary editor dialog is in the `open` state. The context contains the current operation, the
close `reason`, an owned cancellation signal, and `dirty`. Returning or resolving
to `false` keeps the dialog and its form active. Only one close decision can run
at a time.
Remove has no editable form and reports `dirty: false`.

If the form changes while an asynchronous decision is pending, that decision
cannot close the changed form. A new dismissal request starts a new decision;
the hook is not automatically repeated. Starting a submission supersedes any
pending close decision.

The signal is aborted when the decision loses ownership, including form
changes, submission, and destruction. Observe it for expensive asynchronous
checks. AltEditorLite stops awaiting cancelled decisions, but a consumer Promise
that ignores the signal may continue independently.

AltEditorLite determines whether the current form differs from its baseline;
application code decides whether that difference should prevent closing. Create
defaults and caller-supplied initial values form the opening baseline. When
`closeOnSuccess` is false, the canonical successful result becomes the new clean
baseline for Create, Edit, and multi-record Edit.

If the callback throws or rejects, the dialog stays open and the normalized error
is reported to `onError`. Forced cleanup after `destroy()` and automatic closing
after success are not intercepted.

During an active submission, `closeDialog()` immediately cancels editor-owned
work and closes the dialog without invoking `beforeClose`. Cancellation cannot
guarantee that a remote service has not already committed work. Reopening or
refreshing should use authoritative Host/backend state.

## afterSuccess

`afterSuccess(context)` runs after canonical Host application, success and close
handling, and stable presentation focus or navigation. A failure does not roll
back the row, reopen the editor, publish an error event, or change the operation
result. It is reported to `onError` with `committed: true` and
`phase: 'afterSuccess'`.

## onError

`onError(error, context)` receives normalized errors with operation, mode, phase,
commit state, and optional target. `committed` becomes `true` when configured
persistence completes or Host application begins; it does not imply that
presentation completion or success observers ran. Applications should reconcile
current state instead of repeating the complete persistence operation after
such an error. The callback is synchronous and intended for application
reporting. If it throws, AltEditorLite catches the failure, preserves the
original error, and does not call `onError` recursively.
