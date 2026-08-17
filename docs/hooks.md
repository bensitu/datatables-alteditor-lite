# Lifecycle hooks

Four optional lifecycle hooks extend the operation lifecycle. DOM events remain
non-cancelable observation points.

```ts
const editor = new DataTablesEditor(table, {
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

## beforeOpen

`beforeOpen(context)` runs before a dialog or inline control is added to the DOM. Return `false` to decline opening without publishing open or close. An asynchronous hook is cancellable through `context.signal`; the target is revalidated after it resolves.

## beforeSubmit

`beforeSubmit(values, context)` runs after native, custom, and local uniqueness
validation. Plain objects and arrays in `values` are recursively frozen, while
browser host objects such as `File` retain their normal identity. Return `false`
to keep the presentation open without publishing submit or calling persistence.

The hook is veto-only: it cannot return replacement values and cannot bypass validation.

## afterSuccess

`afterSuccess(context)` runs after canonical Host application, success and close
handling, and stable presentation focus or navigation. A failure does not roll
back the row, reopen the editor, publish an error event, or change the operation
result. It is reported to `onError` with `committed: true` and
`phase: 'afterSuccess'`.

## onError

`onError(error, context)` receives normalized errors with operation, mode, phase, commit state, and optional target. It is synchronous and intended for application reporting. If it throws, AltEditorLite catches the failure, preserves the original error, and does not call `onError` recursively.
