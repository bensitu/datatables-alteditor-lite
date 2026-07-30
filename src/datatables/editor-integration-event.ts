/**
 * Internal event used to update optional integration UI without exposing a
 * mutable public lifecycle hook.
 */
export const EDITOR_INTEGRATION_UPDATE_EVENT =
  'alteditor-lite-internal:integration-update';

/**
 * Notifies optional table UI that editor state or selection changed.
 *
 * @param tableElement - Table element that scopes the integration.
 */
export function dispatchEditorIntegrationUpdate(tableElement: HTMLTableElement): void {
  tableElement.dispatchEvent(
    new CustomEvent(EDITOR_INTEGRATION_UPDATE_EVENT, {
      bubbles: false,
      cancelable: false,
    }),
  );
}
