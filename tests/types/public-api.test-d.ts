import { expectAssignable, expectNotAssignable, expectType } from 'tsd';

import {
  AltEditorLite,
  EditorLanguageLoadError,
  isChoiceFieldController,
  loadEditorLanguage,
  registerLocale,
  type AltEditorLiteOptions,
  type AltEditorLiteLanguage,
  type ClientSideOperations,
  type ChoiceFieldController,
  type DialogTemplateSource,
  type EditingOptions,
  type EditorErrorEventDetail,
  type EditorHooks,
  type EditorLanguageDefinition,
  type EditorOperations,
  type EditorSubmitEventDetail,
  type EditorSuccessEventDetail,
  type EditorValues,
  type FieldConfig,
  type FieldController,
  type FieldPath,
  type FieldPathValue,
  type FieldValue,
  type InlineEditingOptions,
  type InlineEditState,
  type OperationContext,
  type RemoteSearchSelectFieldConfig,
  type LocalSearchSelectFieldConfig,
  type SearchSelectFieldConfig,
} from '../../src/index.js';
import en from '../../src/locales/en.json' with { type: 'json' };
import es from '../../src/locales/es.json' with { type: 'json' };
import ja from '../../src/locales/ja.json' with { type: 'json' };
import zhCn from '../../src/locales/zh-cn.json' with { type: 'json' };

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
}

declare const table: Api<Row>;

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

const editor = new AltEditorLite<Row, FormValues>(table, {
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

expectType<AltEditorLite<Row, FormValues>>(editor);
expectType<AltEditorLite<Row, FormValues> | null>(table.altEditorLite<FormValues>());
expectType<AltEditorLite<Row> | null>(table.altEditorLite());
expectType<Promise<void>>(editor.openCreateDialog());
expectType<Promise<void>>(editor.openEditDialog('#row'));
expectType<Promise<void>>(editor.openEditDialog(0));
expectType<Promise<void>>(editor.openRemoveDialog(['#row-a', '#row-b']));
expectType<Promise<void>>(editor.refreshTable());
expectType<Promise<void>>(editor.closeDialog());
expectType<Promise<void>>(editor.openInlineEdit('#row', 0));
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
expectNotAssignable<FieldConfig<FormValues>>({
  label: 'Email',
  name: 'contact.email',
  readonly: true,
  type: 'email',
});

expectAssignable<EditorHooks<Row, FormValues>>({
  beforeSubmit: (_values, context) => {
    expectType<'dialog' | 'inline' | 'api'>(context.mode);
    expectType<Readonly<import('../../src/index.js').EditorOperationTarget> | undefined>(
      context.target,
    );
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
    expectType<OperationContext<Row>>(context);
    expectType<Api<Row>>(context.table);
    expectType<AbortSignal>(context.signal);
    expectType<'create' | 'edit' | 'remove' | 'refresh'>(context.operation);
    expectType<'dialog' | 'inline' | 'api'>(context.mode);
    return {
      id: 'created',
      profile: { email: values.contact?.email ?? '' },
      rank: values.rank ?? 0,
    };
  },
  remove: (rows, context) => {
    expectType<readonly Readonly<Row>[]>(rows);
    expectType<OperationContext<Row>>(context);
  },
  refresh: async (context) => {
    expectType<OperationContext<Row>>(context);
    expectType<'create' | 'edit' | 'remove' | 'refresh'>(context.operation);
    await Promise.resolve();
  },
  update: (values, original, context) => {
    expectType<Readonly<EditorValues<FormValues>>>(values);
    expectType<Readonly<Row>>(original);
    expectType<OperationContext<Row>>(context);
    return {
      ...original,
      profile: { email: values.contact?.email ?? original.profile.email },
      rank: values.rank ?? original.rank,
    };
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
} else {
  expectType<'refresh'>(successDetail.operation);
}

declare const errorDetail: EditorErrorEventDetail<Row, FormValues>;
expectType<'create' | 'edit' | 'remove' | 'refresh'>(errorDetail.operation);
expectType<'dialog' | 'inline' | 'api'>(errorDetail.mode);

expectAssignable<FieldPath<FormValues>>('contact.email');
expectAssignable<FieldPath<FormValues>>('attachment');
expectNotAssignable<FieldPath<FormValues>>('contact.missing');
expectNotAssignable<FieldPath<FormValues>>('contact.email.value');
expectNotAssignable<FieldPath<FormValues>>('__proto__.polluted');
expectType<string>({} as FieldPathValue<FormValues, 'contact.email'>);

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
