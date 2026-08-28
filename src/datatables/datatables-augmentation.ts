import type { DataTablesRecordTarget } from './datatables-host.js';
import type { AltEditorLite } from '../core/alt-editor-lite.js';
import type { DeepPartial } from '../core/editor-values.js';
import type { Api } from 'datatables.net';

declare module 'datatables.net' {
  interface Api<T> {
    /**
     * Retrieves the active editor for this table without creating one.
     */
    altEditorLite<
      TFormValues extends object = T extends object ? DeepPartial<T> : object,
    >(): T extends object
      ? AltEditorLite<T, TFormValues, DataTablesRecordTarget> | null
      : null;
  }
}

export type { Api };
