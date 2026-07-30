import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import {
  getEditorInstance,
  type EditorInstanceLookup,
} from '../instance/editor-instance-store.js';

import { registerEditorApi } from './register-editor-api.js';

import type { DataTablesStatic } from 'datatables.net';

const REGISTRATION_MARKER = Symbol.for('datatables-alteditor-lite.registration.v1');

type RegisteredDataTable = DataTablesStatic & {
  readonly [REGISTRATION_MARKER]?: RegistrationRecord;
};

interface RegistrationRecord {
  readonly instanceLookups: Set<EditorInstanceLookup>;
}

/**
 * Registers AltEditorLite against one DataTables 3.x runtime.
 *
 * Registration is retrieval-only, idempotent across repeated browser bundle
 * evaluation, and does not load optional DataTables extensions.
 *
 * @param dataTable - DataTables static constructor to extend.
 * @throws EditorConfigurationError when the runtime is not DataTables 3.x.
 */
export function registerAltEditorLite(dataTable: DataTablesStatic): void {
  const registeredDataTable: RegisteredDataTable = dataTable;
  const majorVersion = dataTable.version.split('.')[0];

  if (majorVersion !== '3') {
    throw new EditorConfigurationError(
      `DataTables 3.x is required; received "${dataTable.version}".`,
    );
  }

  const existingRegistration = registeredDataTable[REGISTRATION_MARKER];
  if (existingRegistration !== undefined) {
    existingRegistration.instanceLookups.add(getEditorInstance);
    return;
  }

  const registration: RegistrationRecord = {
    instanceLookups: new Set([getEditorInstance]),
  };
  registerEditorApi(dataTable, registration.instanceLookups);
  Object.defineProperty(registeredDataTable, REGISTRATION_MARKER, {
    configurable: false,
    enumerable: false,
    value: registration,
    writable: false,
  });
}
