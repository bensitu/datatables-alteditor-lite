/**
 * Describes a scope whose DataTables constructor has passed the runtime boundary
 * check.
 */
export interface DataTableGlobalScopeWithConstructor {
  readonly DataTable: (...arguments_: never[]) => unknown;
}

/**
 * Checks whether a runtime scope exposes a callable DataTables constructor.
 *
 * @param runtimeScope - The browser-like global scope to inspect.
 * @returns Whether DataTables is available for browser-global registration.
 */
export function hasDataTableGlobal(
  runtimeScope: object,
): runtimeScope is DataTableGlobalScopeWithConstructor {
  return 'DataTable' in runtimeScope && typeof runtimeScope.DataTable === 'function';
}

/**
 * Enforces the browser-global script loading order before registration code runs.
 *
 * @param runtimeScope - The browser-like global scope to inspect.
 * @throws Error when DataTables has not been loaded first.
 */
export function assertDataTableGlobal(
  runtimeScope: object,
): asserts runtimeScope is DataTableGlobalScopeWithConstructor {
  if (!hasDataTableGlobal(runtimeScope)) {
    throw new Error('DataTables must be loaded before datatables-alteditor-lite.');
  }
}
