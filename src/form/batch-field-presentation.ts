import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

export type BatchFieldPresentationRestriction = 'file' | 'unique';

export interface BatchFieldPresentationModel {
  readonly currentStatus: 'common' | 'mixed' | 'overridden';
  readonly disabled: boolean;
  readonly overrideEditorActive: boolean;
  readonly restriction?: BatchFieldPresentationRestriction;
}

export interface BatchFieldPresentationArguments {
  readonly fieldElement: HTMLElement;
  readonly fieldLabel: string;
  readonly fieldName: string;
  readonly focusField: () => void;
  readonly language: Readonly<AltEditorLiteLanguage>;
  readonly onRestore: () => void;
  readonly onSetCommonValue: () => void;
}

/** Owns the rendered controls and listeners for one batch field. */
export class BatchFieldPresentation {
  public readonly element: HTMLDivElement;

  readonly #arguments: BatchFieldPresentationArguments;

  #helperElement: HTMLParagraphElement;

  #restoreButton: HTMLButtonElement;

  #setValueButton: HTMLButtonElement;

  #stateElement: HTMLParagraphElement;

  #statePanel: HTMLDivElement;

  public constructor(configuration: BatchFieldPresentationArguments) {
    this.#arguments = configuration;
    this.element = document.createElement('div');
    this.element.className = 'alteditor-lite-batch-field';
    this.element.dataset['alteditorLiteBatchField'] = configuration.fieldName;

    this.#statePanel = document.createElement('div');
    this.#statePanel.className = 'alteditor-lite-batch-field__state';
    this.#stateElement = document.createElement('p');
    this.#stateElement.className = 'alteditor-lite-batch-field__state-text';
    this.#stateElement.setAttribute('role', 'status');
    const fieldLabelElement = document.createElement('span');
    fieldLabelElement.className = 'alteditor-lite-batch-field__label';
    fieldLabelElement.textContent = configuration.fieldLabel;

    this.#setValueButton = document.createElement('button');
    this.#setValueButton.className = 'alteditor-lite-batch-field__action';
    this.#setValueButton.type = 'button';
    this.#setValueButton.textContent = configuration.language.batchEdit.setCommonValue;
    this.#restoreButton = document.createElement('button');
    this.#restoreButton.className = 'alteditor-lite-batch-field__action';
    this.#restoreButton.type = 'button';
    this.#restoreButton.textContent =
      configuration.language.batchEdit.restoreIndividualValues;
    this.#helperElement = document.createElement('p');
    this.#helperElement.className = 'alteditor-lite-field__description';

    this.#statePanel.append(fieldLabelElement, this.#stateElement, this.#setValueButton);
    this.element.append(
      this.#statePanel,
      configuration.fieldElement,
      this.#restoreButton,
      this.#helperElement,
    );
    this.#setValueButton.addEventListener('click', configuration.onSetCommonValue);
    this.#restoreButton.addEventListener('click', configuration.onRestore);
  }

  public render(model: Readonly<BatchFieldPresentationModel>): void {
    const isMixed = model.currentStatus === 'mixed';
    this.#stateElement.textContent = isMixed
      ? this.#arguments.language.batchEdit.multipleValues
      : this.#arguments.language.batchEdit.commonValue;
    this.#statePanel.hidden = !isMixed && model.restriction !== 'file';
    this.#setValueButton.hidden =
      model.restriction !== undefined || model.overrideEditorActive;
    this.#setValueButton.disabled = model.disabled;
    this.#arguments.fieldElement.hidden =
      model.restriction === 'file' || (isMixed && !model.overrideEditorActive);
    this.#restoreButton.hidden = model.currentStatus !== 'overridden';
    this.#helperElement.textContent =
      model.restriction === 'file'
        ? this.#arguments.language.batchEdit.fileRestriction
        : model.restriction === 'unique'
          ? this.#arguments.language.batchEdit.uniqueRestriction
          : '';
    this.#helperElement.hidden = model.restriction === undefined;
  }

  public focus(target: 'field' | 'setValue'): void {
    if (target === 'setValue') {
      this.#setValueButton.focus();
    } else {
      this.#arguments.focusField();
    }
  }

  public destroy(): void {
    this.#setValueButton.removeEventListener('click', this.#arguments.onSetCommonValue);
    this.#restoreButton.removeEventListener('click', this.#arguments.onRestore);
    this.element.remove();
  }
}
