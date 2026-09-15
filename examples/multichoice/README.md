# MultiChoice custom field

Run `npm run build` and `npm run demo`, then open
[the reference examples](http://127.0.0.1:4173/examples/demo/reference.html#multichoice).
The implementation is [multichoice.js](../demo/multichoice.js).

`defineCustomField` supplies a control that returns a frozen `readonly string[]`.
Order is significant: selecting an unchecked category appends it. Duplicates and
unconfigured values are rejected. `isEqual` compares length and ordered values.
The widget owns its native checkboxes, selection summary, clear button, required
validation, and disabled/read-only behavior. The editor owns labels, errors,
form collection, dialog focus, cancellation, and persistence coordination.

Use Tab to move between checkboxes and Space to add or remove a choice. Clearing
returns focus to the first checkbox. The group receives its accessible name and
error description through the default `ariaTarget` contract. There are no portals
or external focus surfaces. DOM listeners use `context.signal` and are explicitly
removed by `destroy`. Only user interaction calls `onUserChange`; population and
state setters do not. Required validation uses the resolved language.

Create, Edit, and multi-record Edit are supported. A batch override replaces each
record's complete array. Restore removes the override using the existing batch
model. Inline capability is not declared because this example uses several focus
targets and a dialog-sized choice group.

## Implementation notes

The public custom field and Standalone Host APIs are sufficient. No core
workaround, private state access, additional lifecycle API, or unsafe type cast
was required. Checkbox behavior and ordered array equality belong to the widget.
