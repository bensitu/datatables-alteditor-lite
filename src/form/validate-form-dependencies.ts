import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { parseFieldPath } from '../object-path/field-path.js';

import type { FormDependencies } from './form-dependency.js';
import type { FieldConfig } from '../fields/field-config.js';

function isDependencyMap(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/** Validates dependency source paths before editor resources are claimed. */
export function validateFormDependencies<TFormValues extends object>(
  fields: readonly FieldConfig<TFormValues>[],
  dependencies: Readonly<FormDependencies<TFormValues>> | undefined,
): void {
  if (dependencies === undefined) {
    return;
  }
  const runtimeDependencies: unknown = dependencies;
  if (!isDependencyMap(runtimeDependencies)) {
    throw new EditorConfigurationError('dependencies must be an object.');
  }

  const fieldByName = new Map<string, Readonly<FieldConfig<TFormValues>>>(
    fields.map((field) => [field.name, field]),
  );
  for (const [sourcePath, resolver] of Object.entries(runtimeDependencies)) {
    parseFieldPath(sourcePath);
    const sourceField = fieldByName.get(sourcePath);
    if (sourceField === undefined) {
      throw new EditorConfigurationError(
        `Dependency source field "${sourcePath}" is not configured.`,
      );
    }
    if (sourceField.editable === false) {
      throw new EditorConfigurationError(
        `Dependency source field "${sourcePath}" is not rendered in dialog forms.`,
      );
    }
    if (typeof resolver !== 'function') {
      throw new EditorConfigurationError(
        `Dependency resolver for field "${sourcePath}" must be a function.`,
      );
    }
  }
}
