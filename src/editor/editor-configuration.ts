import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { resolveLanguage } from '../core/alt-editor-lite-language.js';
import { resolveEditorCapabilities } from '../core/editor-capabilities.js';
import { LocalUniquenessValidator } from '../core/local-uniqueness-validator.js';
import { resolveEditingOptions } from '../core/resolve-editing-options.js';
import { validateHooksConfiguration } from '../core/validate-hooks-configuration.js';
import { validateOperationConfiguration } from '../core/validate-operation-configuration.js';
import { validateFieldConfigurations } from '../fields/validate-field-configurations.js';
import { validateFormDependencies } from '../form/validate-form-dependencies.js';
import {
  hasHostBatchUpdateCapability,
  hasHostRowCollectionCapability,
} from '../host/editor-host.js';

import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { AltEditorLiteOptions } from '../core/alt-editor-lite-options.js';
import type { EditorCapabilities } from '../core/editor-capabilities.js';
import type { ResolvedEditingOptions } from '../core/resolve-editing-options.js';
import type {
  EditorHost,
  HostRecordEntry,
  HostRowCollectionCapability,
} from '../host/editor-host.js';

/** Resolves and validates the editor configuration before acquiring the Host. */
export function resolveEditorConfiguration<
  TRow extends object,
  TFormValues extends object,
  TTarget,
>(
  host: EditorHost<TRow, TTarget>,
  options: Readonly<AltEditorLiteOptions<TRow, TFormValues>>,
): Readonly<{
  capabilities: Readonly<EditorCapabilities>;
  editing: Readonly<ResolvedEditingOptions<TFormValues>>;
  language: Readonly<AltEditorLiteLanguage>;
  uniquenessValidator: LocalUniquenessValidator<TRow, TFormValues, TTarget>;
}> {
  const editing = resolveEditingOptions(options.editing);
  validateFieldConfigurations(options.fields);
  validateFormDependencies(options.fields, options.dependencies);
  validateOperationConfiguration(options);
  validateHooksConfiguration(options);

  const capabilities = resolveEditorCapabilities(editing, {
    batchEdit:
      hasHostBatchUpdateCapability<TRow, TTarget>(host) &&
      (options.operations?.updateMany !== undefined ||
        options.operations?.update === undefined),
    create:
      options.operations?.create !== undefined ||
      options.clientSide?.createRow !== undefined,
  });
  const language = resolveLanguage(options.language);
  const hasRecordCollectionRequirement = options.fields.some(
    (field) => field.unique === true,
  );
  if (
    hasRecordCollectionRequirement &&
    !hasHostRowCollectionCapability<TRow, TTarget>(host)
  ) {
    throw new EditorConfigurationError(
      'Local uniqueness validation requires a Host row collection capability.',
    );
  }
  const emptyCollection: HostRowCollectionCapability<TRow, TTarget> = {
    entries: (): Iterable<Readonly<HostRecordEntry<TRow, TTarget>>> => [],
  };
  const uniquenessValidator = new LocalUniquenessValidator(
    hasHostRowCollectionCapability<TRow, TTarget>(host) ? host : emptyCollection,
    options.fields,
    language,
  );
  return { capabilities, editing, language, uniquenessValidator };
}
