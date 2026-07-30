import { expectAssignable, expectNotAssignable, expectType } from 'tsd';

import {
  AltEditorLite,
  type AltEditorLiteOptions,
  type FieldConfig,
  type FieldPath,
  type FieldValue,
} from '../../src/index.js';

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

expectAssignable<FieldPath<FormValues>>('contact.email');
expectAssignable<FieldPath<FormValues>>('attachment');
expectNotAssignable<FieldPath<FormValues>>('contact.missing');
expectNotAssignable<FieldPath<FormValues>>('contact.email.value');
expectNotAssignable<FieldPath<FormValues>>('__proto__.polluted');

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
