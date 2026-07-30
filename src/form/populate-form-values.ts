import { getPathValue } from '../object-path/get-path-value.js';

import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/**
 * Populates configured fields from own-property-only nested values.
 *
 * @param controllers - Ordered form controllers.
 * @param values - Partial form values.
 */
export function populateFormValues<TFormValues extends object>(
  controllers: readonly ManagedFieldController<TFormValues>[],
  values: Readonly<object>,
): void {
  for (const controller of controllers) {
    const fieldValue = getPathValue(values, controller.name);
    if (fieldValue !== undefined) {
      controller.setValue(fieldValue);
    }
  }
}
