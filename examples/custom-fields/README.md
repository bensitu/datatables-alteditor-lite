# Consumer-defined tags field

This example implements a comma-separated tags control with only the public
AltEditorLite API. The editor supplies the form structure and lifecycle, while
the application owns the input behavior and value representation.

```ts
import {
  AltEditorLite,
  defineCustomField,
  StandaloneHost,
} from 'datatables-alteditor-lite/standalone';
import 'datatables-alteditor-lite/style.css';

interface Article {
  readonly id: string;
  readonly tags: readonly string[];
  readonly title: string;
}

interface ArticleValues {
  readonly tags: readonly string[];
  readonly title: string;
}

interface TagsOptions {
  readonly maximum: number;
}

const tagsDefinition = defineCustomField<readonly string[], TagsOptions>({
  capabilities: { batch: true },
  createController(options, context) {
    const control = document.createElement('input');
    let isRequired = false;
    control.type = 'text';
    control.placeholder = 'news, featured';

    const readTags = (): readonly string[] =>
      control.value
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    const handleInput = (): void => {
      context.onUserChange();
    };
    control.addEventListener('input', handleInput);

    return {
      control,
      destroy: () => {
        control.removeEventListener('input', handleInput);
      },
      focus: () => {
        control.focus();
      },
      getValue: readTags,
      setDisabled: (disabled) => {
        control.disabled = disabled;
      },
      setReadOnly: (readOnly) => {
        control.readOnly = readOnly;
      },
      setRequired: (required) => {
        isRequired = required;
        control.required = required;
      },
      setValue: (value) => {
        control.value = value.join(', ');
      },
      validate: (signal) => {
        signal.throwIfAborted();
        const value = readTags();
        if (isRequired && value.length === 0) {
          return { message: context.language.validation.required, valid: false };
        }
        return value.length <= options.maximum
          ? { valid: true }
          : {
              message: `Choose no more than ${String(options.maximum)} tags.`,
              valid: false,
            };
      },
    };
  },
  isEqual: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
});

const records = new Map<string, Article>([
  ['article-1', { id: 'article-1', tags: ['news', 'featured'], title: 'Example' }],
]);
const host = new StandaloneHost<Article, string>({
  applyUpdate: (target, row) => {
    records.set(target, row);
    return target;
  },
  applyUpdates: (updates) => {
    for (const { row, target } of updates) {
      records.set(target, row);
    }
  },
  read: (target) => {
    const article = records.get(target);
    if (article === undefined) {
      throw new Error('Article unavailable.');
    }
    return article;
  },
});

const editor = new AltEditorLite<Article, ArticleValues, string>(host, {
  fields: [
    { label: 'Title', name: 'title', type: 'text' },
    tagsDefinition.field<ArticleValues>({
      batchEditable: true,
      description: 'Separate tags with commas.',
      label: 'Tags',
      name: 'tags',
      options: { maximum: 5 },
      required: true,
    }),
  ],
});
```

`context.presentation` identifies `dialog`, `batch`, or `inline`. Set
`capabilities.inline: true` and `inlineEdit: true` when the same adapter is
appropriate for a DataTables cell. Forward `context.signal` and the signal passed
to `validate()` to asynchronous widget work. If the widget uses additional
listeners, popups, or third-party instances, release all of them in `destroy()`.
