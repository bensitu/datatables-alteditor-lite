import { setPathValue } from '../object-path/set-path-value.js';

import type { EditorValues } from '../core/editor-values.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** Internal collection result retaining explicit `undefined` field values. */
export interface CollectedFormState<TFormValues extends object> {
  readonly values: EditorValues<TFormValues>;
  readonly fieldValues: ReadonlyMap<string, unknown>;
}

/**
 * Collects normalized values and the exact set of participating field paths.
 *
 * The public values object still omits `undefined`. The field map lets the
 * built-in Update implementation distinguish an explicit clear from a field
 * that was disabled or not rendered.
 *
 * @param controllers - Ordered form controllers.
 * @param signal - Collection lifecycle signal.
 * @returns Public values plus internal explicit-field metadata.
 */
export async function collectFormState<TFormValues extends object>(
  controllers: readonly ManagedFieldController<TFormValues>[],
  signal: AbortSignal,
): Promise<CollectedFormState<TFormValues>> {
  const collectedFields = await Promise.all(
    controllers
      .filter((controller) => !controller.isDisabled())
      .map(async (controller) => ({
        name: controller.name,
        value: await Promise.resolve(controller.getValue(signal)),
      })),
  );
  signal.throwIfAborted();
  const collectedValues: Record<string, unknown> = {};
  const fieldValues = new Map<string, unknown>();

  for (const collectedField of collectedFields) {
    fieldValues.set(collectedField.name, collectedField.value);
    if (collectedField.value !== undefined) {
      setPathValue(collectedValues, collectedField.name, collectedField.value);
    }
  }

  return {
    fieldValues,
    values: collectedValues as EditorValues<TFormValues>,
  };
}

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
  return (await collectFormState(controllers, signal)).values;
}
