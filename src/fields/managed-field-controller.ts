import type { SelectOption } from './field-config.js';
import type { FieldValidationResult } from './field-controller.js';
import type { MaybePromise } from './field-value.js';
import type { EditorValues } from '../core/editor-values.js';

/**
 * Internal type-erased controller used by FormController.
 */
export interface ManagedFieldController<TFormValues extends object> {
  readonly name: string;
  readonly element: HTMLElement;
  getValue(signal?: AbortSignal): MaybePromise<unknown>;
  setValue(value: unknown): void;
  readonly getOptions?: () => readonly SelectOption[];
  readonly setOptions?: (options: readonly SelectOption[]) => void;
  setDisabled(isDisabled: boolean): void;
  isDisabled(): boolean;
  setReadOnly(isReadOnly: boolean): void;
  isReadOnly(): boolean;
  setRequired(isRequired: boolean): void;
  isRequired(): boolean;
  focus(): void;
  validateNative(): FieldValidationResult;
  validateCustom(
    values: Readonly<EditorValues<TFormValues>>,
    signal: AbortSignal,
  ): Promise<FieldValidationResult>;
  runOnChange(
    values: Readonly<EditorValues<TFormValues>>,
    signal: AbortSignal,
  ): Promise<void>;
  clearError(): void;
  showError(message: string): void;
  getError?(): string | undefined;
  destroy(): void;
}
