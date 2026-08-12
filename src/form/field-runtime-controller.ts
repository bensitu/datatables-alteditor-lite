import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';
import type { FieldMountPoint } from './layout/form-layout.js';

/** Field resources and mutable state owned by one rendered form. */
export interface FormFieldRuntimeEntry<TFormValues extends object> {
  readonly config: Readonly<FieldConfig<TFormValues>>;
  readonly controller: ManagedFieldController<TFormValues>;
  readonly mountPoint: FieldMountPoint;
  visible: boolean;
  disabled: boolean;
  readOnly: boolean;
  required: boolean;
}

/** Applies form field state through controller and layout boundaries. */
export class FieldRuntimeController<TFormValues extends object> {
  public constructor(private readonly entry: FormFieldRuntimeEntry<TFormValues>) {}

  public isVisible(): boolean {
    return this.entry.visible;
  }

  public setVisible(isVisible: boolean): void {
    this.entry.visible = isVisible;
    this.entry.mountPoint.setVisible(isVisible);
  }

  public isDisabled(): boolean {
    return this.entry.disabled;
  }

  public setDisabled(isDisabled: boolean): void {
    this.entry.disabled = isDisabled;
    this.entry.controller.setDisabled(isDisabled);
  }

  public isReadOnly(): boolean {
    return this.entry.readOnly;
  }

  public setReadOnly(isReadOnly: boolean): void {
    this.entry.readOnly = isReadOnly;
    this.entry.controller.setReadOnly(isReadOnly);
  }

  public isRequired(): boolean {
    return this.entry.required;
  }

  public setRequired(isRequired: boolean): void {
    this.entry.required = isRequired;
    this.entry.controller.setRequired(isRequired);
  }
}
