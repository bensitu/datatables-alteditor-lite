# Accessibility

AltEditorLite uses native `<dialog>`, form controls, labels, descriptions, and
constraint semantics. Opening moves focus into the dialog. Escape closes ordinary
dialogs, and closing restores a connected opening control or falls back to the
Host event target when it is an element, otherwise the document body. Busy
operations expose `aria-busy` and make owned form controls inert.

Field errors have stable IDs, use `aria-invalid`, and remain associated through
`aria-describedby`. Field-level feedback uses polite live regions to avoid a burst
of interrupting alerts when several constraints fail together. The modal exposes
`aria-modal`, responds to viewport and virtual-keyboard size changes, and restores
temporary fallback focusability after focus leaves. Remove always has a
destructive confirmation step.

## Custom controls

For a simple custom control, return the native control as `control`. The editor
assigns its label, description, and error relations to that element. For a
composite widget, return the widget root as `control` and its focusable semantic
element as `ariaTarget`. The target must be the root or one of its descendants.
The editor assigns the target ID, `aria-labelledby`, `aria-describedby`, and
`aria-invalid`; the adapter must not remove those relations.

The adapter owns the widget's disabled, read-only, and required implementation
through `setDisabled`, `setReadOnly`, and `setRequired`. Apply the appropriate
native property or ARIA state to the semantic element, and ensure `focus()` moves
focus to it. Required custom values also need adapter validation because the
editor cannot infer an empty representation for an arbitrary value type.

When a composite widget owns a focusable popup outside its mounted subtree,
implement `containsFocusTarget(target)` so focus movement to that popup stays
inside the field boundary. Fields using `validateOn: 'blur'` expose
`aria-busy="true"` while the current asynchronous request is active and retain
their normal label and error relationships.

## SearchSelect keyboard behavior

| Key                   | Behavior                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Arrow Down / Arrow Up | Open and move through enabled options                               |
| Home / End            | Move to the first or last enabled option                            |
| Enter                 | Select the active option; never submit the dialog from the combobox |
| Escape                | Restore the committed selection and close the listbox               |
| Tab                   | Commit a valid option or manual string and leave                    |
| Backspace             | Clear an empty clearable field                                      |

The input uses `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
`aria-controls`, and `aria-activedescendant`. Options expose selected and disabled
states. Result counts and no-result states use a polite live region. The clear
button has a localized accessible name.

Remote loading exposes `aria-busy` on the SearchSelect listbox and a non-selectable
loading row. Threshold guidance, load failures, and resolved selection labels use
the same polite live status; query failures do not open an editor-level modal.
The live status remains outside the busy listbox so loading announcements are not
deferred with its results.

Composition pauses filtering. Enter during Japanese or Chinese IME composition is
consumed by the combobox and cannot be mistaken for option selection or dialog
submission. Filtering resumes on `compositionend`.

The provided stylesheet includes visible focus, light and dark color schemes,
reduced-motion behavior, a 320 px layout, and high-zoom wrapping. Applications
must preserve the supplied labels and maintain sufficient contrast when
overriding CSS variables.

Dialog focus containment covers native controls in the dialog's light DOM.
Applications that insert iframe content or focusable controls inside Shadow DOM
must provide containment within that embedded focus context and return focus to
the dialog when leaving it.

## Stylesheet customization

Override the following inherited variables on `:root` for an application-wide
theme. Set `editing.dialog.className` or `editing.inline.className` and target
that class when only one editor presentation should inherit the mapping. Custom
colors must retain sufficient contrast in light, dark, and forced-color
environments.

| Variable                                    | Default or purpose                          |
| ------------------------------------------- | ------------------------------------------- |
| `--alteditor-lite-surface-color`            | `Canvas`                                    |
| `--alteditor-lite-text-color`               | `CanvasText`                                |
| `--alteditor-lite-border-color`             | Adaptive system-text border                 |
| `--alteditor-lite-focus-color`              | `Highlight`                                 |
| `--alteditor-lite-primary-color`            | Primary action color                        |
| `--alteditor-lite-primary-text-color`       | Text on primary actions                     |
| `--alteditor-lite-error-color`              | Error feedback color                        |
| `--alteditor-lite-error-text-color`         | Existing error contrast value               |
| `--alteditor-lite-danger-color`             | Destructive-action color                    |
| `--alteditor-lite-danger-text-color`        | Text on destructive actions                 |
| `--alteditor-lite-font-family`              | `inherit`                                   |
| `--alteditor-lite-font-size`                | `1rem`                                      |
| `--alteditor-lite-control-background-color` | Surface color                               |
| `--alteditor-lite-control-text-color`       | Text color                                  |
| `--alteditor-lite-control-border-color`     | Border color                                |
| `--alteditor-lite-control-min-height`       | `2.5rem`                                    |
| `--alteditor-lite-focus-width`              | `2px`                                       |
| `--alteditor-lite-focus-offset`             | `2px`                                       |
| `--alteditor-lite-overlay-color`            | `rgb(0 0 0 / 45%)`                          |
| `--alteditor-lite-option-active-color`      | `Highlight`                                 |
| `--alteditor-lite-option-active-text-color` | `HighlightText`                             |
| `--alteditor-lite-popup-shadow`             | SearchSelect popup shadow                   |
| `--alteditor-lite-dialog-width`             | `42rem`                                     |
| `--alteditor-lite-dialog-max-height`        | Available viewport height minus outer space |
| `--alteditor-lite-spacing`                  | `1rem`                                      |
| `--alteditor-lite-border-radius`            | `0.5rem`                                    |
| `--alteditor-lite-search-select-max-height` | `16rem`                                     |

The stylesheet supplies dark-scheme defaults for the primary, error, and popup
colors. `--alteditor-lite-search-select-available-height` is maintained by the
component while its listbox is open and must not be set by application styles.

A Bootstrap-oriented application can scope existing design tokens to one dialog:

```ts
editing: {
  dialog: {
    className: 'admin-editor';
  }
}
```

```css
.admin-editor {
  --alteditor-lite-primary-color: var(--bs-primary);
  --alteditor-lite-primary-text-color: var(--bs-white);
  --alteditor-lite-danger-color: var(--bs-danger);
  --alteditor-lite-danger-text-color: var(--bs-white);
  --alteditor-lite-border-radius: var(--bs-border-radius);
}
```

A custom design system can scope Inline controls independently:

```ts
editing: {
  inline: {
    className: 'product-grid-editor';
  }
}
```

```css
.product-grid-editor {
  --alteditor-lite-font-family: var(--app-font-family);
  --alteditor-lite-control-background-color: var(--app-control-surface);
  --alteditor-lite-control-text-color: var(--app-control-text);
  --alteditor-lite-control-border-color: var(--app-control-border);
  --alteditor-lite-focus-color: var(--app-focus-color);
  --alteditor-lite-focus-width: var(--app-focus-width);
}
```

These mappings are CSS-only and do not require a framework adapter.

## Inline focus and controls

Inline Edit mounts one native control in the owned cell. Its label remains
available to assistive technology while visual error text is presented through a
plain-text modal alert. The focused control supplies the visible focus outline.
Inline errors retain their visually hidden descriptions and `aria-describedby`
association after the alert closes.
The cell editing border becomes transparent while a valid descendant has visible
focus, while an invalid cell retains its error border. Checkbox and text-like
controls use compact dimensions that retain the surrounding row height.

Hover editing uses one native pencil button with a localized accessible name.
The explicit Submit and Cancel controls are native buttons with visible focus.
Double-click editing recognizes two taps on the same eligible cell without
claiming a single tap. On touch, the first hover-mode tap preserves normal table
selection and reveals the pencil.
When KeyTable is installed, its focused cell can expose the pencil and use the
configured shortcut without adding a tab stop to every table cell.

Focus moving to an Inline-owned SearchSelect popup or an error alert does not
trigger the configured blur action. After an alert closes, focus returns to the
current Inline control when it is still available; otherwise it falls back to the
logical cell or table.

An explicit cancellation returns focus to the connected element that initiated
Inline opening. That origin is captured before asynchronous opening work begins,
so an intermediate focus change does not replace the intended restoration
target.

The hover and action layouts use logical CSS properties for RTL, existing theme
variables for light/dark modes, and explicit forced-colors rules. Applications
that override these controls should preserve their names, focus visibility, and
touch target size.
