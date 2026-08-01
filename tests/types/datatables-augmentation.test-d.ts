import { expectAssignable, expectType } from 'tsd';

import type { Api } from 'datatables.net';

interface TestEditor<TRow> {
  readonly marker: 'test';
  readonly original?: TRow;
}

declare module 'datatables.net' {
  interface Api<T> {
    altEditorLiteTest(): TestEditor<T> | null;
  }
}

declare const testTable: Api<{
  readonly id: string;
  readonly name: string;
}>;

expectAssignable<Api<{ readonly id: string; readonly name: string }>>(testTable);
expectType<TestEditor<{
  readonly id: string;
  readonly name: string;
}> | null>(testTable.altEditorLiteTest());
