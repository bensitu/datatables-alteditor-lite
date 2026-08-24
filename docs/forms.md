# Dynamic forms

Dialog Create and Edit use an editor-owned `<form>`. By default, fields appear in
configuration order in the built-in responsive layout. Applications can replace
that arrangement with a cloned template and can derive field state from current
values without taking ownership of form controllers.

## Custom templates

Set `editing.dialog.template` to a selector or an element:

```ts
const editor = new AltEditorLite<EmployeeRow, EmployeeForm>(table, {
  editing: {
    dialog: {
      template: '#employee-form-layout',
    },
  },
  fields,
});
```

```html
<template id="employee-form-layout">
  <section class="employee-form-layout">
    <fieldset>
      <legend>Personal details</legend>
      <div data-alteditor-lite-field="name"></div>
      <div data-alteditor-lite-field="email"></div>
    </fieldset>
    <fieldset>
      <legend>Employment</legend>
      <div data-alteditor-lite-field="employmentType"></div>
      <div data-alteditor-lite-field="contractEnd"></div>
    </fieldset>
  </section>
</template>
```

A string is resolved with `document.querySelector`. An `HTMLTemplateElement`
contributes a fresh clone of its `content`; any other `HTMLElement` is deeply
cloned. AltEditorLite never detaches, moves, or mutates the source. Every form
open receives a separate clone, so one template can serve multiple editor
instances.

Template markup is trusted application configuration. AltEditorLite clones it as
provided and does not sanitize elements or attributes. Use only templates created
by the application, or sanitize externally sourced markup before configuration.

Each editable non-hidden field needs exactly one
`data-alteditor-lite-field="path"` slot. Slots must use configured safe field
paths. Duplicate, unknown, or missing slots are configuration errors. Hidden
fields do not need slots and are appended to editor-owned layout space. A
template cannot contain another `<form>`, and cloned identifiers must remain
unique in the document.

The application owns layout markup and CSS. AltEditorLite owns every field node,
label association, control identifier, validation message, busy state, and
cleanup. Keep semantic grouping such as `<fieldset>` and `<legend>`, preserve a
logical reading order, and let the editor move focus to invalid controls.

## Hidden and initially concealed fields

`type: 'hidden'` creates a non-visual value that can be collected but can never
be made visible. A visible field with `visible: false` is created normally but
starts without layout participation. Dependencies and public field controllers
can later reveal that field.

Visibility does not imply availability:

- a concealed enabled field remains collectible and validatable;
- a disabled field is omitted from collected values;
- a read-only field remains enabled and collectible;
- a required field applies its native constraint while enabled.

## Runtime field state

`editor.getField(path)` returns a controller only while a Dialog form is open.
Its value and runtime state methods are:

```ts
const field = editor.getField('prefecture');
if (field !== null) {
  const value = await field.getValue();
  field.setValue(value);
  field.setVisible(true);
  field.setDisabled(false);
  field.setReadOnly(false);
  field.setRequired(true);
}
```

`setValue()` validates programmatic values against the field contract. Invalid
types, unavailable choice values, and unsupported file values throw
`EditorConfigurationError`; they are not coerced. `getValue()` always returns a
Promise because file and SearchSelect values may require asynchronous work.

Use `isChoiceFieldController(field)` before changing options:

```ts
const field = editor.getField('prefecture');
if (field !== null && isChoiceFieldController(field)) {
  field.setOptions([
    { label: 'Tokyo', value: 'tokyo' },
    { label: 'Osaka', value: 'osaka' },
  ]);
}
```

Select, Radio, and SearchSelect preserve exact string or number identity. A
replacement option list retains the current value only when that value remains
available. Dynamic SearchSelect options update its local list or remote cache;
they do not replace a configured remote source.

## Declarative dependencies

`dependencies` associates a Dialog source field with a pure resolver. Use
`defineFormDependencies` when explicit form-value typing is needed:

```ts
const dependencies = defineFormDependencies<EmployeeForm>()({
  country: async (country, { signal, values }) => {
    const options = country === 'JP' ? await loadPrefectures(country, signal) : [];
    return {
      prefecture: {
        options,
        required: country === 'JP',
        value: undefined,
        visible: country === 'JP',
      },
    };
  },
  employmentType: (employmentType) => ({
    contractEnd: {
      required: employmentType === 'contractor',
      visible: employmentType === 'contractor',
    },
  }),
});
```

The context values are immutable. A resolver returns field patches containing
`options`, `value`, `visible`, `readOnly`, `required`, or `disabled`. AltEditorLite
validates the complete result before applying any change. Within one target,
options are applied before value, followed by visibility, read-only, required,
and disabled state. A rejected result leaves all target state unchanged.

When Create defaults or Edit source values have been populated, every resolver
runs against the same initial snapshot before the dialog becomes visible. Patches
that assign different properties of one target are merged. Two resolvers that
assign different values to the same target property are ambiguous and reject the
open request instead of relying on configuration order.

For user input, only the changed source resolver runs. A newer change aborts its
older request, and results are applied only while their form and request remain
current. Closing or destroying the form aborts all resolver work. A rejected
current resolver leaves the form interactive, shows a safe error, and blocks
submission until a later successful result clears it.

Multi-record Dialog Edit supplies a logical values object containing common
fields and explicit common overrides. Preserved differing fields are omitted and
their resolvers do not run. When the user supplies a common value, that source
resolver runs once for the whole selection. A dependency `value` patch becomes
an explicit override; patches cannot assign values to unique or file fields.
Option-only patches do not create a change unless the available options actually
alter the current value.

### Dependency changes do not cascade

A user change can run that source field's dependency resolver. A patch that
changes another field's `value` does not automatically run the target field's
resolver. A dependency patch also does not fire the target field's `onChange()`.
Resolvers are not recursive; coordinate related state in one explicit result
when several targets must change together.

## Form-level validation

`validateForm` receives an immutable candidate and an operation context. It runs
for Dialog Create, single Dialog Edit, multi-record Dialog Edit, and Inline Edit:

```ts
validateForm: async (values, { mode, operation, signal }) => {
  await verifySchedule(values, signal);
  if (
    values.startDate !== undefined &&
    values.contractEnd !== undefined &&
    values.contractEnd < values.startDate
  ) {
    return {
      fieldErrors: {
        contractEnd: 'Contract end must not precede the start date.',
      },
      message: 'Review the employment dates.',
      valid: false,
    };
  }
  return { valid: true };
},
```

For multi-record Edit, the editor builds one effective candidate per original by
reading configured paths and overlaying the common changes. It invokes
`validateForm` once per candidate with `operation: 'batchEdit'` and
`mode: 'dialog'`. Repeated identical errors are presented once, and any invalid
candidate prevents persistence and Host application.

Dialog validation waits for current dependency and `onChange` work, then runs
native constraints, field validators, local uniqueness, and `validateForm`.
Earlier field errors take precedence when several checks report the same path.
`message` appears in the form submission region. A failed result keeps the form
open and prevents `beforeSubmit`, submit events, persistence, and Host mutation.

Inline validation builds a complete candidate from the canonical row plus the
edited cell. It runs native and active-field validation, local uniqueness, waits
for current active-field `onChange`, and then runs `validateForm` with
`mode: 'inline'`. An error for the active path appears on the Inline presentation.
Errors for other paths and a global message appear in its alert summary because
other Dialog field controllers do not exist.

Dialog dependencies intentionally do not run during single-cell Inline editing.
Visibility, options, and required state belong to the rendered Dialog form. Use
`validateForm` for cross-field data constraints that must also protect Inline
updates.

Starting a new validation aborts the preceding validation signal. Closing an
editor presentation or destroying the editor also aborts validation. Aborted and
superseded results do not change field state, display errors, or submit data.

## CSS and accessibility

Template CSS may arrange slots with grid, flexbox, or normal flow. Scope custom
rules to an application class inside the template and avoid styling generated
identifiers. Do not hide generated labels or errors, replace editor controls, or
move fields outside the owned form.

Use semantic headings, fieldsets, and legends where they add structure. Keep the
DOM order meaningful at narrow widths, ensure every revealed field remains
reachable by keyboard, and preserve visible focus indicators in custom themes.
AltEditorLite continues to own label associations, `aria-invalid`, alert regions,
dialog focus containment, invalid-field focus, and focus restoration.
