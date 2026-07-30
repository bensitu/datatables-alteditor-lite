import { expectAssignable, expectType } from 'tsd';

import type { Api } from 'datatables.net';

interface ContractEditor<TRow> {
  readonly marker: 'contract';
  readonly original?: TRow;
}

declare module 'datatables.net' {
  interface Api<T> {
    altEditorLiteContract(): ContractEditor<T> | null;
  }
}

declare const contractTable: Api<{
  readonly id: string;
  readonly name: string;
}>;

expectAssignable<Api<{ readonly id: string; readonly name: string }>>(contractTable);
expectType<ContractEditor<{
  readonly id: string;
  readonly name: string;
}> | null>(contractTable.altEditorLiteContract());
