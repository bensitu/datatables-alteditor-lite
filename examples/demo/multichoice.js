import {
  AltEditorLite,
  defineCustomField,
  EditorConfigurationError,
  StandaloneHost,
} from '../../dist/esm/standalone.js';

/** @type {import('../../dist/esm/standalone.js').CustomFieldDefinition<readonly string[], { choices: readonly string[] }>} */
export const multiChoice = defineCustomField({
  capabilities: { batch: true },
  isEqual: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
  createController(options, context) {
    const control = document.createElement('div');
    control.setAttribute('role', 'group');
    control.tabIndex = -1;
    const summary = document.createElement('p');
    summary.setAttribute('role', 'status');
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = 'Clear choices';
    let value = Object.freeze([]);
    let isDisabled = false;
    let isReadOnly = false;
    let isRequired = false;
    const inputs = options.choices.map((choice) => {
      const label = document.createElement('label');
      label.className = 'reference-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = choice;
      label.append(input, document.createTextNode(choice));
      control.append(label);
      return input;
    });
    control.append(summary, clear);

    const render = () => {
      for (const input of inputs) {
        input.checked = value.includes(input.value);
        input.disabled = isDisabled;
        input.setAttribute('aria-readonly', String(isReadOnly));
      }
      clear.disabled = isDisabled || isReadOnly || value.length === 0;
      summary.textContent = `${isRequired ? 'Required. ' : ''}Selected: ${value.join(', ') || 'None'}`;
    };
    const handleClick = (event) => {
      if (isReadOnly || isDisabled || context.signal.aborted) {
        event.preventDefault();
      }
    };
    const handleChange = (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !inputs.includes(input)) return;
      value = Object.freeze(
        input.checked
          ? [...value, input.value]
          : value.filter((choice) => choice !== input.value),
      );
      render();
      context.onUserChange();
    };
    const clearChoices = () => {
      value = Object.freeze([]);
      render();
      inputs[0]?.focus();
      context.onUserChange();
    };
    control.addEventListener('click', handleClick, { signal: context.signal });
    control.addEventListener('change', handleChange, { signal: context.signal });
    clear.addEventListener('click', clearChoices, { signal: context.signal });

    return {
      control,
      getValue: () => value,
      setValue(next) {
        if (
          !Array.isArray(next) ||
          new Set(next).size !== next.length ||
          next.some((choice) => !options.choices.includes(choice))
        ) {
          throw new EditorConfigurationError('Choose distinct configured categories.');
        }
        value = Object.freeze([...next]);
        render();
      },
      setDisabled(disabled) {
        isDisabled = disabled;
        render();
      },
      setReadOnly(readOnly) {
        isReadOnly = readOnly;
        render();
      },
      setRequired(required) {
        isRequired = required;
        render();
      },
      focus: () => inputs[0]?.focus(),
      validate(signal) {
        signal.throwIfAborted();
        return isRequired && value.length === 0
          ? { valid: false, message: context.language.validation.required }
          : { valid: true };
      },
      destroy() {
        control.removeEventListener('click', handleClick);
        control.removeEventListener('change', handleChange);
        clear.removeEventListener('click', clearChoices);
      },
    };
  },
});

const section = document.querySelector('#multichoice');
const records = new Map([
  ['article-1', { id: 'article-1', categories: ['News'] }],
  ['article-2', { id: 'article-2', categories: ['Guides'] }],
]);
const renderRecords = () => {
  section.querySelector('output').textContent = [...records.values()]
    .map((row) => `${row.id}: ${row.categories.join(', ')}`)
    .join('\n');
};
const host = new StandaloneHost({
  eventTarget: section,
  read: (id) => records.get(id),
  applyCreate(row) {
    records.set(row.id, row);
    renderRecords();
    return row.id;
  },
  applyUpdate(id, row) {
    records.set(id, row);
    renderRecords();
    return id;
  },
  applyUpdates(updates) {
    for (const { target, row } of updates) records.set(target, row);
    renderRecords();
  },
});
const editor = new AltEditorLite(host, {
  fields: [
    multiChoice.field({
      name: 'categories',
      label: 'Categories',
      description: 'Use Tab to move and Space to select. Selection order is preserved.',
      defaultValue: [],
      required: true,
      options: { choices: ['News', 'Guides', 'Research'] },
    }),
  ],
  clientSide: {
    createRow: (values) => ({ id: crypto.randomUUID(), categories: values.categories }),
  },
});
section.querySelector('[data-action="create"]').addEventListener('click', () => {
  void editor.openCreateDialog();
});
section.querySelector('[data-action="edit"]').addEventListener('click', () => {
  void editor.openEditDialog('article-1');
});
section.querySelector('[data-action="batch"]').addEventListener('click', () => {
  void editor.openBatchEditDialog(['article-1', 'article-2']);
});
section.querySelector('[data-action="readonly"]').addEventListener('click', () => {
  void editor.openEditDialog('article-1').then(() => {
    editor.getField('categories').setReadOnly(true);
  });
});
section.querySelector('[data-action="disabled"]').addEventListener('click', () => {
  void editor.openEditDialog('article-1').then(() => {
    editor.getField('categories').setDisabled(true);
  });
});
window.addEventListener('pagehide', () => editor.destroy(), { once: true });
renderRecords();
