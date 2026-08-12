/** DOM location owned by a form layout for one configured field. */
export interface FieldMountPoint {
  readonly element: HTMLElement;
  mount(fieldElement: HTMLElement): void;
  setVisible(visible: boolean): void;
}

/** Places editor-owned field elements without managing their controllers. */
export interface FormLayout {
  readonly element: HTMLElement;
  mountField(fieldName: string, fieldElement: HTMLElement): FieldMountPoint;
  destroy(): void;
}

/** Creates a mount point around one layout slot. */
export function createFieldMountPoint(element: HTMLElement): FieldMountPoint {
  return {
    element,
    mount: (fieldElement) => {
      element.replaceChildren(fieldElement);
    },
    setVisible: (visible) => {
      element.hidden = !visible;
      element.classList.toggle('dt-alteditor-lite-form__slot--hidden', !visible);
    },
  };
}
