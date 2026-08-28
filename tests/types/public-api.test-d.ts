import { expectAssignable, expectNotAssignable, expectType } from 'tsd';

import {
  type AltEditorLite as TableEditor,
  DataTablesHost,
  defineCustomField as defineDataTablesCustomField,
  type CustomFieldPresentation as DataTablesCustomFieldPresentation,
  type DataTablesRecordTarget,
} from '../../src/datatables.js';
import {
  AltEditorLite as CoreEditor,
  defineCustomField,
  defineFormDependencies,
  EditorLanguageLoadError,
  isChoiceFieldController,
  loadEditorLanguage,
  registerLocale,
  type AltEditorLiteOptions,
  type AltEditorLiteLanguage,
  type BatchChanges,
  type BatchEditOperationContext,
  type BatchFieldState,
  type ClientSideOperations,
  type ChoiceFieldController,
  type DialogTemplateSource,
  type DialogAction,
  type DeepPartial,
  type EditingOptions,
  type EditorErrorEventDetail,
  type EditorHooks,
  type EditorLanguageDefinition,
  type EditorLanguageLoadOptions,
  type EditorOperations,
  type CreateOperationContext,
  type EditOperationContext,
  type EditorSubmitEventDetail,
  type EditorSuccessEventDetail,
  type EditorValues,
  type FieldConfig,
  type FieldController,
  type CustomFieldAdapter,
  type CustomFieldConfigOptions,
  type CustomFieldControllerContext,
  type CustomFieldPresentation,
  type FieldPath,
  type FieldPathValue,
  type FieldStatePatchFor,
  type FieldValue,
  type InlineEditingOptions,
  type InlineEditState,
  type HostBatchUpdateCapability,
  type HostReadContext,
  type RefreshOperationContext,
  type RemoveOperationContext,
  type FormDependencies,
  type FormFieldErrors,
  type FormValidationContext,
  type FormValidationResult,
  type FormValidator,
  type RemoteSearchSelectFieldConfig,
  type LocalSearchSelectFieldConfig,
  type SearchSelectFieldConfig,
} from '../../src/index.js';
import en from '../../src/locales/en.json' with { type: 'json' };
import es from '../../src/locales/es.json' with { type: 'json' };
import ja from '../../src/locales/ja.json' with { type: 'json' };
import zhCn from '../../src/locales/zh-cn.json' with { type: 'json' };
import {
  defineCustomField as defineStandaloneCustomField,
  StandaloneHost,
  type CustomFieldPresentation as StandaloneCustomFieldPresentation,
  type StandaloneHostOptions,
} from '../../src/standalone.js';

import type { Api } from 'datatables.net';

interface Row {
  readonly id: string;
  readonly profile: {
    readonly email: string;
  };
  readonly rank: number;
}

interface FormValues {
  readonly contact: {
    readonly email: string;
  };
  readonly rank: number | null;
  readonly role: number;
  readonly attachment: File | null;
  readonly tags: readonly string[];
}

interface TagOptions {
  readonly maximum: number;
}

declare const table: Api<Row>;

expectAssignable<StandaloneHostOptions<Row, string>>({
  applyUpdates: (updates, context) => {
    expectType<readonly Readonly<{ target: string; row: Row }>[]>(updates);
    expectType<'batchEdit' | 'create' | 'edit' | 'remove'>(context.operation);
  },
  read: () => ({ id: 'row', profile: { email: '' }, rank: 0 }),
});
expectAssignable<StandaloneHostOptions<Row, string>>({
  read: async (_target, context) => {
    expectType<Readonly<HostReadContext> | undefined>(context);
    return await Promise.resolve({ id: 'row', profile: { email: '' }, rank: 0 });
  },
});
expectAssignable<StandaloneHostOptions<Row, string>>({
  read: () => ({ id: 'row', profile: { email: '' }, rank: 0 }),
});
expectType<StandaloneHost<Row, string>>(
  new StandaloneHost<Row, string>({
    applyUpdates: () => undefined,
    read: () => ({ id: 'row', profile: { email: '' }, rank: 0 }),
  }),
);

expectAssignable<AltEditorLiteOptions<Row>>({
  clientSide: {
    createRow: (values) => ({
      id: 'row',
      profile: { email: values.profile?.email ?? '' },
      rank: values.rank ?? 0,
    }),
  },
  fields: [
    {
      label: 'Email',
      name: 'profile.email',
      type: 'email',
    },
  ],
});

const host = new DataTablesHost(table);
const editor = new CoreEditor<
  Row,
  FormValues,
  ReturnType<typeof host.resolveRecordTarget>
>(host, {
  clientSide: {
    createRow: (values) => ({
      id: 'row',
      profile: { email: values.contact?.email ?? '' },
      rank: values.rank ?? 0,
    }),
  },
  fields: [
    {
      label: 'Email',
      name: 'contact.email',
      type: 'email',
      unique: true,
    },
    {
      emptyValue: null,
      label: 'Rank',
      name: 'rank',
      type: 'number',
    },
  ],
});

expectType<CoreEditor<Row, FormValues, ReturnType<typeof host.resolveRecordTarget>>>(
  editor,
);
expectType<CoreEditor<Row, FormValues, DataTablesRecordTarget> | null>(
  table.altEditorLite<FormValues>(),
);
expectType<CoreEditor<Row, DeepPartial<Row>, DataTablesRecordTarget> | null>(
  table.altEditorLite(),
);
expectType<Promise<void>>(editor.openCreateDialog());
expectType<Promise<void>>(editor.openEditDialog(host.resolveRecordTarget('#row')));
expectType<Promise<void>>(
  editor.openBatchEditDialog(host.resolveRecordTargets('.selected')),
);
declare const altEditorLite: TableEditor<Row, FormValues>;
expectType<Promise<void>>(altEditorLite.openBatchEditDialog('.selected'));
expectType<Promise<void>>(
  editor.openRemoveDialog(host.resolveRecordTargets('.selected')),
);
expectType<Promise<void>>(editor.refresh());
expectType<Promise<void>>(editor.closeDialog());
expectType<Promise<void>>(editor.openInlineEdit(host.createInlineTarget('#row', 0)));
expectType<Promise<void>>(editor.submitInlineEdit());
expectType<Promise<void>>(editor.cancelInlineEdit());
expectType<Readonly<InlineEditState>>(editor.getInlineState());
expectType<boolean>(editor.isInlineEditing());

expectAssignable<EditingOptions<Row, FormValues>>({
  dialog: {
    closeOnSuccess: false,
    enabled: true,
  },
  inline: {
    columns: {
      contact: 'contact.email',
      disabled: false,
    },
    enabled: true,
  },
});
expectAssignable<AltEditorLiteOptions<Row, FormValues>>({
  editing: {
    dialog: { enabled: true },
    inline: { activation: 'doubleClick', enabled: true },
  },
  fields: [],
});
expectAssignable<InlineEditingOptions<Row, FormValues>>({
  activation: 'hover',
  enabled: true,
  keyboardActivation: { key: 'F2' },
});
expectAssignable<InlineEditingOptions<Row, FormValues>>({
  keyboardActivation: { ctrlKey: true, key: 'e' },
});
expectAssignable<InlineEditingOptions<Row, FormValues>>({
  keyboardActivation: false,
});
expectNotAssignable<InlineEditingOptions<Row, FormValues>>({
  keyboardActivation: { key: 2 },
});
expectNotAssignable<InlineEditingOptions<Row, FormValues>>({ activation: 'dblclick' });
expectNotAssignable<InlineEditingOptions<Row, FormValues>>({
  columns: { contact: 'contact.missing' },
});
expectNotAssignable<AltEditorLiteOptions<Row, FormValues>>({
  editMode: 'inlineDoubleClick',
  fields: [],
});
expectNotAssignable<AltEditorLiteOptions<Row, FormValues>>({
  fields: [],
  inline: { fields: ['contact.email'] },
});
expectNotAssignable<AltEditorLiteOptions<Row, FormValues>>({
  closeOnSuccess: false,
  fields: [],
});
expectAssignable<DialogTemplateSource>('#employee-editor');
expectAssignable<DialogTemplateSource>(document.createElement('template'));
expectAssignable<FieldConfig<FormValues>>({
  label: 'Email',
  name: 'contact.email',
  readOnly: true,
  type: 'email',
});

const tagsDefinition = defineCustomField<readonly string[], TagOptions>({
  capabilities: { batch: true, inline: true },
  createController: (options, context) => {
    expectType<Readonly<TagOptions>>(options);
    expectType<Readonly<CustomFieldControllerContext>>(context);
    expectType<string>(context.language.locale);
    expectType<CustomFieldPresentation>(context.presentation);
    expectType<'dialog' | 'batch' | 'inline'>(context.presentation);
    expectType<AbortSignal>(context.signal);
    const adapter: CustomFieldAdapter<readonly string[]> = {
      control: document.createElement('div'),
      destroy: () => undefined,
      focus: () => undefined,
      getValue: () => [],
      setDisabled: () => undefined,
      setReadOnly: () => undefined,
      setRequired: () => undefined,
      setValue: () => undefined,
      validate: (signal) => {
        expectType<AbortSignal>(signal);
        return { valid: true };
      },
    };
    return adapter;
  },
  isEqual: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
});
const tagsField = tagsDefinition.field<FormValues>({
  batchEditable: true,
  defaultValue: [],
  inlineEdit: true,
  label: 'Tags',
  name: 'tags',
  options: { maximum: 4 },
});
expectAssignable<FieldConfig<FormValues>>(tagsField);
expectType<readonly string[]>({} as FieldValue<typeof tagsField>);
expectType<typeof defineCustomField>(defineDataTablesCustomField);
expectType<typeof defineCustomField>(defineStandaloneCustomField);
expectType<CustomFieldPresentation>({} as DataTablesCustomFieldPresentation);
expectType<CustomFieldPresentation>({} as StandaloneCustomFieldPresentation);
expectNotAssignable<CustomFieldConfigOptions<FormValues, readonly string[], TagOptions>>({
  label: 'Tags',
  name: 'tags',
  options: { maximum: '4' },
});
expectNotAssignable<CustomFieldConfigOptions<FormValues, readonly string[], TagOptions>>({
  defaultValue: [4],
  label: 'Tags',
  name: 'tags',
  options: { maximum: 4 },
});
expectNotAssignable<CustomFieldConfigOptions<FormValues, readonly string[], TagOptions>>({
  label: 'Tags',
  name: 'missing',
  options: { maximum: 4 },
});
expectNotAssignable<FieldConfig<FormValues>>({
  label: 'Email',
  name: 'contact.email',
  readonly: true,
  type: 'email',
});

expectAssignable<EditorHooks<Row, FormValues>>({
  beforeSubmit: (_values, context) => {
    expectType<'dialog' | 'inline'>(context.mode);
    if (context.operation === 'edit') {
      expectType<Readonly<import('../../src/index.js').EditorOperationTarget>>(
        context.target,
      );
    } else if (context.operation === 'batchEdit') {
      expectType<readonly Readonly<import('../../src/index.js').EditorOperationTarget>[]>(
        context.targets,
      );
    }
    return false;
  },
});
expectNotAssignable<EditorHooks<Row, FormValues>>({
  beforeSubmit: () => ({ rank: 4 }),
});

const operations: EditorOperations<Row, FormValues> = {
  create: async (values, context) => {
    await Promise.resolve();
    expectType<Readonly<EditorValues<FormValues>>>(values);
    expectType<CreateOperationContext>(context);
    expectType<AbortSignal>(context.signal);
    expectType<'create'>(context.operation);
    expectType<'dialog'>(context.mode);
    return {
      id: 'created',
      profile: { email: values.contact?.email ?? '' },
      rank: values.rank ?? 0,
    };
  },
  remove: (rows, context) => {
    expectType<readonly Readonly<Row>[]>(rows);
    expectType<RemoveOperationContext>(context);
  },
  refresh: async (context) => {
    expectType<RefreshOperationContext>(context);
    expectType<'refresh'>(context.operation);
    await Promise.resolve();
  },
  update: (values, original, context) => {
    expectType<Readonly<EditorValues<FormValues>>>(values);
    expectType<Readonly<Row>>(original);
    expectType<EditOperationContext>(context);
    return {
      ...original,
      profile: { email: values.contact?.email ?? original.profile.email },
      rank: values.rank ?? original.rank,
    };
  },
  updateMany: (changes, originals, context) => {
    expectType<Readonly<BatchChanges<FormValues>>>(changes);
    expectType<readonly Readonly<Row>[]>(originals);
    expectType<BatchEditOperationContext>(context);
    return originals.map((original) => ({
      ...original,
      rank: changes.rank ?? original.rank,
    }));
  },
};
expectAssignable<EditorOperations<Row, FormValues>>(operations);

const clientSide: ClientSideOperations<Row, FormValues> = {
  createRow: (values) => ({
    id: 'client-created',
    profile: { email: values.contact?.email ?? '' },
    rank: values.rank ?? 0,
  }),
  updateRow: (original, values) => ({
    ...original,
    rank: values.rank ?? original.rank,
  }),
};
expectAssignable<ClientSideOperations<Row, FormValues>>(clientSide);
expectNotAssignable<ClientSideOperations<Row, FormValues>>({
  createRow: async () => ({
    ...(await Promise.resolve({
      id: 'invalid-async',
      profile: { email: '' },
      rank: 0,
    })),
  }),
});

declare const submitDetail: EditorSubmitEventDetail<Row, FormValues>;
if (submitDetail.operation === 'create') {
  expectType<Readonly<EditorValues<FormValues>>>(submitDetail.values);
} else if (submitDetail.operation === 'edit') {
  expectType<Readonly<Row>>(submitDetail.original);
  expectType<Readonly<EditorValues<FormValues>>>(submitDetail.values);
} else if (submitDetail.operation === 'batchEdit') {
  expectType<Readonly<BatchChanges<FormValues>>>(submitDetail.changes);
  expectType<readonly Readonly<Row>[]>(submitDetail.originals);
  expectType<readonly Readonly<import('../../src/index.js').EditorOperationTarget>[]>(
    submitDetail.targets,
  );
} else {
  expectType<readonly Readonly<Row>[]>(submitDetail.rows);
}

declare const successDetail: EditorSuccessEventDetail<Row, FormValues>;
if (successDetail.operation === 'create') {
  expectType<Readonly<Row>>(successDetail.row);
} else if (successDetail.operation === 'edit') {
  expectType<Readonly<Row>>(successDetail.original);
  expectType<Readonly<Row>>(successDetail.row);
} else if (successDetail.operation === 'remove') {
  expectType<readonly Readonly<Row>[]>(successDetail.rows);
} else if (successDetail.operation === 'batchEdit') {
  expectType<Readonly<BatchChanges<FormValues>>>(successDetail.changes);
  expectType<readonly Readonly<Row>[]>(successDetail.rows);
} else {
  expectType<'refresh'>(successDetail.operation);
}

declare const errorDetail: EditorErrorEventDetail<Row, FormValues>;
expectType<'create' | 'edit' | 'batchEdit' | 'remove' | 'refresh'>(errorDetail.operation);
expectType<'dialog' | 'inline' | 'api'>(errorDetail.mode);

expectAssignable<FieldPath<FormValues>>('contact.email');
expectAssignable<FieldPath<FormValues>>('attachment');
expectNotAssignable<FieldPath<FormValues>>('contact.missing');
expectNotAssignable<FieldPath<FormValues>>('contact.email.value');
expectNotAssignable<FieldPath<FormValues>>('__proto__.polluted');
expectType<string>({} as FieldPathValue<FormValues, 'contact.email'>);
expectAssignable<FieldStatePatchFor<FormValues, 'role'>>({
  options: [{ label: 'Administrator', value: 7 }],
  required: true,
  value: 7,
  visible: true,
});
expectNotAssignable<FieldStatePatchFor<FormValues, 'role'>>({ value: '7' });

const dependencies = defineFormDependencies<FormValues>()({
  ['contact.email']: (value, context) => {
    expectType<string>(value);
    expectType<Readonly<EditorValues<FormValues>>>(context.values);
    expectType<AbortSignal>(context.signal);
    return {
      role: {
        options: [{ label: 'Administrator', value: 7 }],
        value: 7,
      },
    };
  },
});
expectAssignable<FormDependencies<FormValues>>(dependencies);
expectAssignable<AltEditorLiteOptions<Row, FormValues>>({
  dependencies,
  fields: [],
});

const formValidator: FormValidator<FormValues> = (values, context) => {
  expectType<Readonly<EditorValues<FormValues>>>(values);
  expectType<FormValidationContext>(context);
  expectType<AbortSignal>(context.signal);
  expectType<'create' | 'edit' | 'batchEdit'>(context.operation);
  expectType<'dialog' | 'inline'>(context.mode);
  return {
    fieldErrors: { rank: 'Rank must match the selected role.' },
    message: 'Review the related fields.',
    valid: false,
  };
};
expectAssignable<AltEditorLiteOptions<Row, FormValues>>({
  fields: [],
  validateForm: formValidator,
});
expectAssignable<FormFieldErrors<FormValues>>({
  'contact.email': 'Enter an email address.',
  rank: 'Enter a rank.',
});
expectAssignable<FormValidationResult<FormValues>>({ valid: true });
expectNotAssignable<FormValidationResult<FormValues>>({
  fieldErrors: { missing: 'Unknown field.' },
  valid: false,
});

expectAssignable<DialogAction>('batchEdit');
expectAssignable<BatchChanges<FormValues>>({ rank: 4 });
expectAssignable<BatchFieldState<string>>({
  baseline: { status: 'mixed' },
  current: { status: 'overridden', value: 'Tokyo' },
});
expectAssignable<HostBatchUpdateCapability<Row, string>>({
  applyUpdates: () => Promise.resolve(),
});

expectNotAssignable<FieldConfig<FormValues>>({
  name: 'contact.email',
  type: 'text',
});
expectNotAssignable<FieldConfig<FormValues>>({
  label: 'Hidden',
  name: 'contact.email',
  type: 'hidden',
});
expectNotAssignable<FieldConfig<FormValues>>({
  label: 'Role',
  name: 'role',
  type: 'select',
});
expectNotAssignable<FieldConfig<FormValues>>({
  label: 'Role',
  name: 'role',
  type: 'radio',
});

const nullableNumber = {
  emptyValue: null,
  label: 'Rank',
  name: 'rank',
  type: 'number',
} as const satisfies FieldConfig<FormValues>;
expectType<number | null>({} as FieldValue<typeof nullableNumber>);
expectAssignable<FieldConfig<FormValues>>(nullableNumber);

const numericSelect = {
  label: 'Role',
  name: 'role',
  options: [{ label: 'Administrator', value: 7 }],
  type: 'select',
} as const satisfies FieldConfig<FormValues>;
expectType<7 | undefined>({} as FieldValue<typeof numericSelect>);
expectAssignable<FieldConfig<FormValues>>(numericSelect);

const numericSearchSelect = {
  allowClear: true,
  label: 'Role',
  name: 'role',
  options: [
    { label: 'Administrator', value: 7 },
    { label: 'Editor', value: 8 },
  ],
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<FormValues, number>;
expectType<7 | 8 | undefined>({} as FieldValue<typeof numericSearchSelect>);
expectAssignable<FieldConfig<FormValues>>(numericSearchSelect);

const manualStringSearchSelect = {
  allowManualValue: true,
  label: 'Email',
  name: 'contact.email',
  options: [{ label: 'Known address', value: 'known@example.test' }],
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<FormValues>;
expectType<string | undefined>({} as FieldValue<typeof manualStringSearchSelect>);
expectAssignable<FieldConfig<FormValues>>(manualStringSearchSelect);

expectNotAssignable<SearchSelectFieldConfig<FormValues, number>>({
  allowManualValue: true,
  label: 'Role',
  name: 'role',
  options: [{ label: 'Administrator', value: 7 }],
  type: 'search-select',
});

const mixedSearchSelect = {
  label: 'Role',
  name: 'role',
  options: [
    { label: 'Numeric', value: 1 },
    { label: 'String', value: '1' },
  ],
  type: 'search-select',
} as const satisfies SearchSelectFieldConfig<FormValues, string | number>;
expectType<1 | '1' | undefined>({} as FieldValue<typeof mixedSearchSelect>);
expectAssignable<FieldConfig<FormValues>>(mixedSearchSelect);

const remoteSearchSelect = {
  label: 'Remote role',
  remote: {
    loadOptions: (_query, context) => {
      expectType<AbortSignal>(context.signal);
      return Promise.resolve([{ label: 'Administrator', value: 7 }]);
    },
    resolveOption: (value, context) => {
      expectType<number>(value);
      expectType<AbortSignal>(context.signal);
      return Promise.resolve({ label: 'Administrator', value });
    },
  },
  name: 'role',
  search: { debounceMs: 100, threshold: 1 },
  type: 'search-select',
} as const satisfies RemoteSearchSelectFieldConfig<FormValues, number>;
expectAssignable<SearchSelectFieldConfig<FormValues, number>>(remoteSearchSelect);
expectAssignable<FieldConfig<FormValues>>(remoteSearchSelect);

expectNotAssignable<RemoteSearchSelectFieldConfig<FormValues, number>>({
  label: 'Remote role',
  name: 'role',
  remote: { loadOptions: () => [] },
  type: 'search-select',
});
expectNotAssignable<LocalSearchSelectFieldConfig<FormValues, number>>({
  label: 'Local role',
  name: 'role',
  options: [{ label: 'Administrator', value: 7 }],
  remote: {
    loadOptions: () => [],
    resolveOption: () => ({ label: 'Administrator', value: 7 }),
  },
  type: 'search-select',
});
expectNotAssignable<SearchSelectFieldConfig<FormValues, number>>({
  debounceMs: 100,
  label: 'Old configuration',
  loadOptions: () => [],
  name: 'role',
  resolveOption: () => ({ label: 'Administrator', value: 7 }),
  searchThreshold: 1,
  type: 'search-select',
});

const roleController = editor.getField('role');
expectType<FieldController<number> | null>(roleController);
expectType<Promise<number>>(roleController?.getValue() ?? Promise.resolve(0));
if (roleController !== null && isChoiceFieldController(roleController)) {
  expectAssignable<ChoiceFieldController<number>>(roleController);
  roleController.setOptions([{ label: 'Administrator', value: 7 }]);
  expectNotAssignable<Parameters<typeof roleController.setOptions>[0]>([
    { label: 'Invalid', value: '7' },
  ]);
}

expectAssignable<Readonly<AltEditorLiteLanguage>>(en);
expectAssignable<Readonly<AltEditorLiteLanguage>>(ja);
expectAssignable<Readonly<AltEditorLiteLanguage>>(zhCn);
expectAssignable<Readonly<AltEditorLiteLanguage>>(es);
const customLanguage = {
  actions: { create: 'Créer' },
  locale: 'fr-FR',
} as const satisfies EditorLanguageDefinition;
expectType<Readonly<AltEditorLiteLanguage>>(registerLocale(customLanguage));
expectType<Promise<Readonly<AltEditorLiteLanguage>>>(
  loadEditorLanguage('/languages/fr-FR.json'),
);
const languageLoadOptions = {
  credentials: 'same-origin',
  maxResourceBytes: 256 * 1024,
} as const satisfies EditorLanguageLoadOptions;
expectType<Promise<Readonly<AltEditorLiteLanguage>>>(
  loadEditorLanguage('/languages/enterprise.json', languageLoadOptions),
);
const languageLoadError = new EditorLanguageLoadError(
  'Locale failed.',
  new Error('Network unavailable.'),
);
expectType<string | undefined>(languageLoadError.code);
expectType<boolean>(languageLoadError.retryable);
const singleFile = {
  label: 'Attachment',
  name: 'attachment',
  type: 'file',
} as const satisfies FieldConfig<FormValues>;
expectType<File | null>({} as FieldValue<typeof singleFile>);
expectAssignable<FieldConfig<FormValues>>(singleFile);

const multipleDataUrlFile = {
  encoding: 'data-url',
  label: 'Attachment',
  multiple: true,
  name: 'attachment',
  type: 'file',
} as const satisfies FieldConfig<FormValues>;
expectType<readonly string[]>({} as FieldValue<typeof multipleDataUrlFile>);
expectAssignable<FieldConfig<FormValues>>(multipleDataUrlFile);
