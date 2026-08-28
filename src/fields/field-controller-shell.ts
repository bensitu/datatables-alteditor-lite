interface FieldShellConfig {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly className?: string;
}

export interface FieldControllerShellArguments {
  readonly config: Readonly<FieldShellConfig>;
  readonly fieldId: string;
  readonly control: HTMLElement;
  readonly controlContainer?: HTMLElement;
  readonly labelPlacement?: 'before-control' | 'after-control';
  readonly useAriaLabelReference?: boolean;
}

export interface FieldControllerShell {
  readonly element: HTMLDivElement;
  clearError(): void;
  showError(message: string): void;
}

function addConsumerClasses(element: HTMLElement, className: string): void {
  for (const classToken of className.split(/\s+/u)) {
    if (classToken.length > 0) {
      element.classList.add(classToken);
    }
  }
}

function addAriaReference(
  element: HTMLElement,
  attribute: 'aria-describedby' | 'aria-labelledby',
  identifier: string,
): void {
  const references = new Set(
    (element.getAttribute(attribute) ?? '')
      .split(/\s+/u)
      .filter((reference) => reference.length > 0),
  );
  references.add(identifier);
  element.setAttribute(attribute, [...references].join(' '));
}

/** Creates the common label, description, control, and error DOM structure. */
export function createFieldControllerShell(
  shellArguments: Readonly<FieldControllerShellArguments>,
): FieldControllerShell {
  const { config, control, fieldId } = shellArguments;
  const fieldElement = document.createElement('div');
  const errorElement = document.createElement('div');
  const errorId = `${fieldId}-error`;

  fieldElement.className = 'alteditor-lite-field';
  fieldElement.dataset['fieldName'] = config.name;
  errorElement.className = 'alteditor-lite-field__error';
  errorElement.id = errorId;
  errorElement.hidden = true;
  errorElement.setAttribute('aria-live', 'polite');

  control.id = fieldId;
  control.classList.add('alteditor-lite-field__control');
  addAriaReference(control, 'aria-describedby', errorId);

  const controlContainer = shellArguments.controlContainer ?? control;
  if (config.label !== undefined && shellArguments.labelPlacement === 'after-control') {
    const labelElement = document.createElement('label');
    const labelTextElement = document.createElement('span');
    labelElement.className = 'alteditor-lite-checkbox';
    labelElement.htmlFor = fieldId;
    labelTextElement.className = 'alteditor-lite-field__label';
    labelTextElement.textContent = config.label;
    labelElement.append(control, labelTextElement);
    fieldElement.append(labelElement);
  } else if (config.label !== undefined) {
    const labelElement = document.createElement('label');
    labelElement.className = 'alteditor-lite-field__label';
    labelElement.htmlFor = fieldId;
    labelElement.textContent = config.label;
    if (shellArguments.useAriaLabelReference === true) {
      labelElement.id = `${fieldId}-label`;
      addAriaReference(control, 'aria-labelledby', labelElement.id);
    }
    fieldElement.append(labelElement, controlContainer);
  } else {
    fieldElement.append(controlContainer);
  }

  if (config.description !== undefined) {
    const descriptionElement = document.createElement('div');
    const descriptionId = `${fieldId}-description`;
    descriptionElement.className = 'alteditor-lite-field__description';
    descriptionElement.id = descriptionId;
    descriptionElement.textContent = config.description;
    addAriaReference(control, 'aria-describedby', descriptionId);
    fieldElement.append(descriptionElement);
  }

  fieldElement.append(errorElement);
  if (config.className !== undefined) {
    addConsumerClasses(fieldElement, config.className);
  }

  return {
    element: fieldElement,
    clearError: () => {
      control.removeAttribute('aria-invalid');
      errorElement.hidden = true;
      errorElement.textContent = '';
    },
    showError: (message) => {
      control.setAttribute('aria-invalid', 'true');
      errorElement.textContent = message;
      errorElement.hidden = false;
    },
  };
}
