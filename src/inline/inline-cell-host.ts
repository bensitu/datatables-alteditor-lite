import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';
import type { FieldConfig } from '../fields/field-config.js';
import type { ManagedFieldController } from '../fields/managed-field-controller.js';

/** DOM host and busy/error presentation for one inline field controller. */
export class InlineCellHost<TFormValues extends object> {
  public readonly element: HTMLDivElement;

  private readonly errorElement: HTMLDivElement;

  private readonly statusElement: HTMLDivElement;

  private readonly primaryControl:
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;

  public constructor(
    private readonly controller: ManagedFieldController<TFormValues>,
    private readonly field: Readonly<FieldConfig<TFormValues>>,
    fieldId: string,
    language: Readonly<AltEditorLiteLanguage>,
    className?: string,
  ) {
    this.element = document.createElement('div');
    const controlElement = document.createElement('div');
    this.errorElement = document.createElement('div');
    this.statusElement = document.createElement('div');

    this.element.className = 'alteditor-lite-inline';
    this.element.dataset['alteditorLiteInline'] = '';
    this.element.setAttribute('aria-busy', 'false');
    controlElement.className = 'alteditor-lite-inline__control';
    this.errorElement.className = 'alteditor-lite-inline__error';
    this.errorElement.id = `${fieldId}-operation-error`;
    this.errorElement.hidden = true;
    this.errorElement.setAttribute('aria-live', 'polite');
    this.errorElement.setAttribute('role', 'alert');
    this.statusElement.className = 'alteditor-lite-inline__status';
    this.statusElement.setAttribute('aria-live', 'polite');
    this.statusElement.textContent = language.inline.editStarted;

    if (className !== undefined) {
      this.element.classList.add(...className.split(/\s+/u));
    }

    controlElement.append(controller.element);
    this.element.append(controlElement, this.errorElement, this.statusElement);
    this.primaryControl = controller.element.querySelector('input, select, textarea');
    this.primaryControl?.setAttribute('aria-label', this.field.label ?? this.field.name);
  }

  /** Focuses the controller's primary control. */
  public focus(): void {
    this.controller.focus();
  }

  /** Displays an operation-level error without replacing field validation text. */
  public showError(message: string): void {
    this.element.classList.add('alteditor-lite-inline--invalid');
    this.errorElement.textContent = message;
    this.errorElement.hidden = false;
  }

  /** Clears only the operation-level error. */
  public clearError(): void {
    this.element.classList.remove('alteditor-lite-inline--invalid');
    this.errorElement.textContent = '';
    this.errorElement.hidden = true;
  }

  /** Freezes or restores the control while persistence owns the candidate. */
  public setBusy(isBusy: boolean, language: Readonly<AltEditorLiteLanguage>): void {
    this.element.classList.toggle('alteditor-lite-inline--busy', isBusy);
    this.element.setAttribute('aria-busy', String(isBusy));
    this.statusElement.textContent = isBusy ? language.inline.saving : '';

    if (
      this.field.type === 'search-select' ||
      this.primaryControl instanceof HTMLSelectElement ||
      (this.primaryControl instanceof HTMLInputElement &&
        this.primaryControl.type === 'checkbox')
    ) {
      this.controller.setDisabled(isBusy);
      return;
    }
    if (
      this.primaryControl instanceof HTMLInputElement ||
      this.primaryControl instanceof HTMLTextAreaElement
    ) {
      this.primaryControl.readOnly =
        isBusy || ('readonly' in this.field && this.field.readonly);
    }
  }
}
