import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { BatchFieldPresentation } from '../../src/form/batch-field-presentation.js';

afterEach(() => {
  document.body.replaceChildren();
});

function createPresentation() {
  const fieldElement = document.createElement('div');
  const focusField = vi.fn();
  const onRestore = vi.fn();
  const onSetCommonValue = vi.fn();
  const presentation = new BatchFieldPresentation({
    fieldElement,
    fieldLabel: 'Office',
    fieldName: 'office',
    focusField,
    language: ENGLISH_LANGUAGE,
    onRestore,
    onSetCommonValue,
  });
  document.body.append(presentation.element);
  return {
    fieldElement,
    focusField,
    onRestore,
    onSetCommonValue,
    presentation,
  };
}

describe('BatchFieldPresentation', () => {
  it('renders mixed, overridden, and restricted field models', () => {
    const { fieldElement, presentation } = createPresentation();
    const statePanel = presentation.element.querySelector<HTMLElement>(
      '.alteditor-lite-batch-field__state',
    );
    const [setValueButton, restoreButton] = [
      ...presentation.element.querySelectorAll<HTMLButtonElement>('button'),
    ];
    const restrictionDescription = presentation.element.querySelector<HTMLElement>(
      '.alteditor-lite-field__description',
    );

    presentation.render({
      currentStatus: 'mixed',
      disabled: true,
      overrideEditorActive: false,
    });
    expect(statePanel?.hidden).toBe(false);
    expect(setValueButton?.hidden).toBe(false);
    expect(setValueButton?.disabled).toBe(true);
    expect(fieldElement.hidden).toBe(true);

    presentation.render({
      currentStatus: 'overridden',
      disabled: false,
      overrideEditorActive: true,
    });
    expect(statePanel?.hidden).toBe(true);
    expect(fieldElement.hidden).toBe(false);
    expect(restoreButton?.hidden).toBe(false);

    presentation.render({
      currentStatus: 'common',
      disabled: false,
      overrideEditorActive: true,
      restriction: 'file',
    });
    expect(statePanel?.hidden).toBe(false);
    expect(fieldElement.hidden).toBe(true);
    expect(restrictionDescription?.textContent).toBe(
      ENGLISH_LANGUAGE.batchEdit.fileRestriction,
    );
  });

  it('routes actions and removes listeners during destruction', () => {
    const { focusField, onRestore, onSetCommonValue, presentation } =
      createPresentation();
    const [setValueButton, restoreButton] = [
      ...presentation.element.querySelectorAll<HTMLButtonElement>('button'),
    ];

    setValueButton?.click();
    restoreButton?.click();
    presentation.focus('setValue');
    expect(document.activeElement).toBe(setValueButton);
    presentation.focus('field');

    expect(onSetCommonValue).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
    expect(focusField).toHaveBeenCalledOnce();

    presentation.destroy();
    setValueButton?.click();
    restoreButton?.click();
    expect(onSetCommonValue).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledOnce();
    expect(presentation.element.isConnected).toBe(false);
  });
});
