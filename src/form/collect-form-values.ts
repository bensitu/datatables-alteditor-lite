import { setPathValue } from '../object-path/set-path-value.js';

import type { EditorValues } from '../core/editor-values.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/**
 * Collects enabled controller values concurrently in stable field order.
 *
 * Disabled fields and `undefined` normalized values are omitted.
 *
 * @param controllers - Ordered form controllers.
 * @param signal - Collection lifecycle signal.
 * @returns Safely nested editor values.
 */
export async function collectFormValues<TFormValues extends object>(
  controllers: readonly ManagedFieldController<TFormValues>[],
  signal: AbortSignal,
): Promise<EditorValues<TFormValues>> {
  const collectedFields = await Promise.all(
    controllers
      .filter((controller) => !controller.isDisabled())
      .map(async (controller) => ({
        name: controller.name,
        value: await Promise.resolve(controller.getValue(signal)),
      })),
  );
  const collectedValues: Record<string, unknown> = {};

  for (const collectedField of collectedFields) {
    if (collectedField.value !== undefined) {
      setPathValue(collectedValues, collectedField.name, collectedField.value);
    }
  }

  return collectedValues as EditorValues<TFormValues>;
}
