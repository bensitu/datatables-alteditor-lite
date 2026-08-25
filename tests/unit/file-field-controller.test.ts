import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EditorConfigurationError,
  EditorFileLimitError,
} from '../../src/core/alt-editor-lite-error.js';
import { createFileFieldController } from '../../src/fields/file-field-controller.js';

import type { FileFieldConfig } from '../../src/fields/field-config.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';

interface FileValues {
  readonly attachment: File | null;
  readonly attachments: readonly File[];
  readonly encodedAttachment: string | null;
  readonly encodedAttachments: readonly string[];
}

const budgetMessages = {
  fileCount: 'Too many files.',
  fileSize: 'File too large.',
};
const defaultDataUrlMaxFileBytes = 5 * 1024 * 1024;
const defaultDataUrlMaxFileCount = 5;
const activeControllers = new Set<ManagedFieldController<FileValues>>();

afterEach(() => {
  for (const controller of activeControllers) {
    controller.destroy();
  }
  activeControllers.clear();
  document.body.replaceChildren();
});

function createController(
  config: FileFieldConfig<FileValues>,
): ManagedFieldController<FileValues> {
  const controller = createFileFieldController(
    config,
    `file-${config.name}`,
    'Invalid file selection.',
    'Select a file.',
    budgetMessages,
    vi.fn(),
  );
  activeControllers.add(controller);
  document.body.append(controller.element);
  return controller;
}

function getInput(controller: ManagedFieldController<FileValues>): HTMLInputElement {
  const inputElement = controller.element.querySelector<HTMLInputElement>('input');
  if (inputElement === null) {
    throw new Error('Expected a file input.');
  }
  return inputElement;
}

function setSelectedFiles(inputElement: HTMLInputElement, files: readonly File[]): void {
  Object.defineProperty(inputElement, 'files', {
    configurable: true,
    value: files,
  });
}

describe('file field controller', () => {
  it('collects single and multiple File values with native properties', async () => {
    const singleController = createController({
      accept: '.txt',
      label: 'Attachment',
      name: 'attachment',
      type: 'file',
    });
    const multipleController = createController({
      label: 'Attachments',
      maxFileCount: 2,
      multiple: true,
      name: 'attachments',
      type: 'file',
    });
    const singleInput = getInput(singleController);
    const multipleInput = getInput(multipleController);
    const firstFile = new File(['first'], 'first.txt', { type: 'text/plain' });
    const secondFile = new File(['second'], 'second.txt', {
      type: 'text/plain',
    });

    expect(singleInput.accept).toBe('.txt');
    expect(singleInput.multiple).toBe(false);
    expect(await Promise.resolve(singleController.getValue())).toBeNull();

    setSelectedFiles(singleInput, [firstFile]);
    setSelectedFiles(multipleInput, [firstFile, secondFile]);

    await expect(Promise.resolve(singleController.getValue())).resolves.toBe(firstFile);
    await expect(Promise.resolve(multipleController.getValue())).resolves.toEqual([
      firstFile,
      secondFile,
    ]);
    expect(multipleInput.multiple).toBe(true);
  });

  it('encodes single and multiple selections as data URLs', async () => {
    const singleController = createController({
      encoding: 'data-url',
      label: 'Encoded attachment',
      name: 'encodedAttachment',
      type: 'file',
    });
    const multipleController = createController({
      encoding: 'data-url',
      label: 'Encoded attachments',
      multiple: true,
      name: 'encodedAttachments',
      type: 'file',
    });
    const firstFile = new File(['first'], 'first.txt', { type: 'text/plain' });
    const secondFile = new File(['second'], 'second.txt', {
      type: 'text/plain',
    });

    setSelectedFiles(getInput(singleController), [firstFile]);
    setSelectedFiles(getInput(multipleController), [firstFile, secondFile]);

    await expect(Promise.resolve(singleController.getValue())).resolves.toMatch(
      /^data:text\/plain;base64,/u,
    );
    const encodedFiles = await Promise.resolve(multipleController.getValue());
    expect(encodedFiles).toEqual([
      expect.stringMatching(/^data:text\/plain;base64,/u),
      expect.stringMatching(/^data:text\/plain;base64,/u),
    ]);
  });

  it('cancels an earlier data URL read when collection restarts', async () => {
    const controller = createController({
      encoding: 'data-url',
      label: 'Encoded attachment',
      name: 'encodedAttachment',
      type: 'file',
    });
    const inputElement = getInput(controller);
    setSelectedFiles(inputElement, [new File(['first'], 'first.txt')]);
    const firstRead = Promise.resolve(controller.getValue());

    setSelectedFiles(inputElement, [new File(['second'], 'second.txt')]);
    const secondRead = Promise.resolve(controller.getValue());

    await expect(firstRead).rejects.toMatchObject({ name: 'AbortError' });
    await expect(secondRead).resolves.toContain('data:application/octet-stream;base64,');
  });

  it('rejects over-budget selections before collection', () => {
    const countController = createController({
      label: 'Attachments',
      maxFileCount: 1,
      multiple: true,
      name: 'attachments',
      type: 'file',
    });
    const sizeController = createController({
      label: 'Attachment',
      maxFileBytes: 2,
      name: 'attachment',
      type: 'file',
    });
    const file = new File(['large'], 'large.txt');
    setSelectedFiles(getInput(countController), [file, file]);
    setSelectedFiles(getInput(sizeController), [file]);

    expect(countController.validateNative()).toEqual({
      message: 'Too many files.',
      valid: false,
    });
    expect(sizeController.validateNative()).toEqual({
      message: 'File too large.',
      valid: false,
    });
    expect(() => countController.getValue()).toThrow(
      new EditorFileLimitError('Too many files.'),
    );
  });

  it('applies default budgets only when file content is encoded', () => {
    const encodedSingleController = createController({
      encoding: 'data-url',
      label: 'Encoded attachment',
      name: 'encodedAttachment',
      type: 'file',
    });
    const encodedMultipleController = createController({
      encoding: 'data-url',
      label: 'Encoded attachments',
      multiple: true,
      name: 'encodedAttachments',
      type: 'file',
    });
    const fileController = createController({
      label: 'Attachments',
      multiple: true,
      name: 'attachments',
      type: 'file',
    });
    const oversizedFile = new File([], 'oversized.bin');
    Object.defineProperty(oversizedFile, 'size', {
      configurable: true,
      value: defaultDataUrlMaxFileBytes + 1,
    });
    const manyFiles = Array.from(
      { length: defaultDataUrlMaxFileCount + 1 },
      (_, index) => new File([], `file-${String(index)}.bin`),
    );

    setSelectedFiles(getInput(encodedSingleController), [oversizedFile]);
    setSelectedFiles(getInput(encodedMultipleController), manyFiles);
    setSelectedFiles(getInput(fileController), [...manyFiles, oversizedFile]);

    expect(encodedSingleController.validateNative()).toEqual({
      message: 'File too large.',
      valid: false,
    });
    expect(encodedMultipleController.validateNative()).toEqual({
      message: 'Too many files.',
      valid: false,
    });
    expect(fileController.validateNative()).toEqual({ valid: true });
  });

  it('allows data URL defaults to be explicitly disabled', () => {
    const controller = createController({
      encoding: 'data-url',
      label: 'Encoded attachments',
      maxFileBytes: null,
      maxFileCount: null,
      multiple: true,
      name: 'encodedAttachments',
      type: 'file',
    });
    const oversizedFile = new File([], 'oversized.bin');
    Object.defineProperty(oversizedFile, 'size', {
      configurable: true,
      value: defaultDataUrlMaxFileBytes + 1,
    });
    const files = Array.from(
      { length: defaultDataUrlMaxFileCount + 1 },
      () => oversizedFile,
    );
    setSelectedFiles(getInput(controller), files);

    expect(controller.validateNative()).toEqual({ valid: true });
  });

  it('accepts only empty programmatic values and blocks readonly interaction', () => {
    const controller = createController({
      label: 'Attachment',
      name: 'attachment',
      readOnly: true,
      type: 'file',
    });
    const inputElement = getInput(controller);

    expect(() => {
      controller.setValue(null);
    }).not.toThrow();
    expect(() => {
      controller.setValue([]);
    }).not.toThrow();
    expect(() => {
      controller.setValue(new File(['data'], 'data.txt'));
    }).toThrow(EditorConfigurationError);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
    });
    inputElement.dispatchEvent(clickEvent);
    inputElement.dispatchEvent(keyEvent);
    const tabEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Tab',
    });
    inputElement.dispatchEvent(tabEvent);

    expect(inputElement.getAttribute('aria-readonly')).toBe('true');
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(keyEvent.defaultPrevented).toBe(true);
    expect(tabEvent.defaultPrevented).toBe(false);
  });
});
