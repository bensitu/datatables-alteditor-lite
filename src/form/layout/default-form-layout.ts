import {
  createFieldMountPoint,
  type FieldMountPoint,
  type FormLayout,
} from './form-layout.js';

/** Places fields in configuration order using the built-in layout. */
export class DefaultFormLayout implements FormLayout {
  public readonly element = document.createElement('div');

  public constructor() {
    this.element.className = 'dt-alteditor-lite-form__layout';
  }

  public mountField(_fieldName: string, fieldElement: HTMLElement): FieldMountPoint {
    const slotElement = document.createElement('div');
    slotElement.className = 'dt-alteditor-lite-form__slot';
    const mountPoint = createFieldMountPoint(slotElement);
    mountPoint.mount(fieldElement);
    this.element.append(slotElement);
    return mountPoint;
  }

  public destroy(): void {
    this.element.replaceChildren();
    this.element.remove();
  }
}
