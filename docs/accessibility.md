---
audience: public
status: stable
---

# Accessibility

AltEditorLite uses native `<dialog>`, form controls, labels, descriptions, and
constraint semantics. Opening moves focus into the dialog. Escape closes ordinary
dialogs, and closing restores a connected opening control or falls back to the
table. Busy operations expose `aria-busy` and make owned form controls inert.

Field errors have stable IDs, use `aria-invalid`, and remain associated through
`aria-describedby`. Remove always has a destructive confirmation step.

## SearchSelect keyboard contract

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

The final stylesheet includes visible focus, light and dark color schemes,
reduced-motion behavior, a 320 px layout, and high-zoom wrapping. Applications
must preserve the supplied labels and maintain sufficient contrast when
overriding CSS variables.
