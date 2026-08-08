# Accessibility

AltEditorLite uses native `<dialog>`, form controls, labels, descriptions, and
constraint semantics. Opening moves focus into the dialog. Escape closes ordinary
dialogs, and closing restores a connected opening control or falls back to the
table. Busy operations expose `aria-busy` and make owned form controls inert.

Field errors have stable IDs, use `aria-invalid`, and remain associated through
`aria-describedby`. Field-level feedback uses polite live regions to avoid a burst
of interrupting alerts when several constraints fail together. The modal exposes
`aria-modal`, responds to viewport and virtual-keyboard size changes, and restores
temporary table focusability after closing. Remove always has a destructive
confirmation step.

## SearchSelect keyboard behavior

| Key                   | Behavior                                                            |
| --------------------- | ------------------------------------------------------------------- |
| Arrow Down / Arrow Up | Open and move through enabled options                               |
| Home / End            | Move to the first or last enabled option                            |
| Enter                 | Select the active option; never submit the dialog from the combobox |
| Escape                | Close the listbox without closing the dialog                        |
| Tab                   | Commit a valid option or manual string and leave                    |
| Backspace             | Clear an empty clearable field                                      |

The input uses `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`,
`aria-controls`, and `aria-activedescendant`. Options expose selected and disabled
states. Result counts and no-result states use a polite live region. The clear
button has a localized accessible name.

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

## Inline focus and controls

Inline Edit mounts one native control in the owned cell. Its label remains
available to assistive technology while visual error text is presented through a
plain-text modal alert. The editing cell supplies the visible focus outline, so
the nested control does not create several competing focus rings. Checkbox and
text-like controls use compact dimensions that retain the surrounding row height.

Focus moving to an Inline-owned SearchSelect popup or an error alert does not
trigger the configured blur action. After an alert closes, focus returns to the
current Inline control when it is still available; otherwise it falls back to the
logical cell or table.
