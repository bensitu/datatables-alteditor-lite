import type { InlineCellHost } from './inline-cell-host.js';
import type { InlineEditView, InlineEditViewHandlers } from './inline-edit-view.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function createActionButton(
  action: 'submit' | 'cancel',
  label: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `alteditor-lite-inline__action alteditor-lite-inline__action--${action}`;
  button.dataset['alteditorLiteInlineAction'] = action;
  button.setAttribute('aria-label', label);
  button.title = label;

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('viewBox', '0 0 24 24');
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', action === 'submit' ? 'm5 12 4 4L19 6' : 'M6 6l12 12M18 6 6 18');
  icon.append(path);
  button.append(icon);
  return button;
}

/** Adds explicit submit and cancel actions to the shared inline cell host. */
export class ActionInlineEditView<TFormValues extends object> implements InlineEditView {
  public readonly element: HTMLDivElement;

  private readonly submitButton: HTMLButtonElement;

  private readonly cancelButton: HTMLButtonElement;

  public constructor(
    private readonly host: InlineCellHost<TFormValues>,
    handlers: Readonly<InlineEditViewHandlers>,
    submitLabel: string,
    cancelLabel: string,
  ) {
    this.element = host.element;
    this.element.classList.add('alteditor-lite-inline--actions');
    const actions = document.createElement('div');
    actions.className = 'alteditor-lite-inline__actions';
    this.submitButton = createActionButton('submit', submitLabel);
    this.cancelButton = createActionButton('cancel', cancelLabel);
    this.submitButton.addEventListener('click', handlers.onSubmit);
    this.cancelButton.addEventListener('click', () => {
      handlers.onCancel('cancel');
    });
    actions.append(this.submitButton, this.cancelButton);
    this.element.append(actions);
  }

  public focus(): void {
    this.host.focus();
  }

  public mount(cell: HTMLTableCellElement): void {
    this.host.mount(cell);
  }

  public setBusy(isBusy: boolean): void {
    this.host.setBusy(isBusy);
    this.setActionBusy(isBusy);
  }

  public setActionBusy(isBusy: boolean): void {
    this.element.classList.toggle('alteditor-lite-inline--busy', isBusy);
    this.element.setAttribute('aria-busy', String(isBusy));
    this.submitButton.disabled = isBusy;
    this.cancelButton.disabled = isBusy;
  }

  public setInvalid(isInvalid: boolean): void {
    this.host.setInvalid(isInvalid);
  }

  public unmount(options: Readonly<{ restoreOriginalContent: boolean }>): void {
    this.host.unmount(options);
  }

  public destroy(): void {
    this.host.destroy();
  }
}
