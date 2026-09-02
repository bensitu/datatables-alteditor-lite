import { afterEach, describe, expect, it, vi } from 'vitest';

import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { BatchFieldBinding } from '../../src/form/batch-field-binding.js';
import { createFieldMountPoint } from '../../src/form/layout/form-layout.js';

interface TestValues {
  readonly office: string;
}

const activeBindings = new Set<BatchFieldBinding<TestValues>>();

afterEach(() => {
  for (const binding of activeBindings) {
    binding.destroy();
  }
  activeBindings.clear();
  document.body.replaceChildren();
});

function createBinding(originals: readonly Readonly<TestValues>[]) {
  const slot = document.createElement('div');
  document.body.append(slot);
  const mountPoint = createFieldMountPoint(slot);
  const onDestroyRequest = vi.fn((binding: BatchFieldBinding<TestValues>) => {
    binding.destroy();
  });
  const onRestore = vi.fn();
  const binding = new BatchFieldBinding<TestValues>({
    config: { label: 'Office', name: 'office', type: 'text' },
    fieldId: 'batch-binding-office',
    language: ENGLISH_LANGUAGE,
    lifecycleSignal: new AbortController().signal,
    mount: (element) => {
      mountPoint.mount(element);
      return mountPoint;
    },
    onDestroyRequest,
    onErrorChange: vi.fn(),
    onRestore,
    onUserValue: vi.fn(),
    onValueChange: vi.fn(),
    originals,
    validate: () => Promise.resolve({ valid: true }),
  });
  activeBindings.add(binding);
  return { binding, onDestroyRequest, onRestore };
}

describe('BatchFieldBinding', () => {
  it('coordinates override, restore, rebase, and its public facade', async () => {
    const { binding, onDestroyRequest, onRestore } = createBinding([
      { office: 'Tokyo' },
      { office: 'Osaka' },
    ]);
    const { field } = binding;

    expect(binding.state.current.status).toBe('mixed');
    field.setValue('Seoul');
    expect(binding.state.current).toEqual({ status: 'overridden', value: 'Seoul' });
    await expect(field.getValue()).resolves.toBe('Seoul');

    const restoreButton = binding.controller.element.parentElement
      ?.querySelectorAll<HTMLButtonElement>('button')
      .item(1);
    restoreButton?.click();
    expect(binding.state.current.status).toBe('mixed');
    expect(onRestore).toHaveBeenCalledOnce();

    binding.rebase([{ office: 'Kyoto' }, { office: 'Kyoto' }]);
    expect(binding.state.current).toEqual({ status: 'common', value: 'Kyoto' });
    await expect(field.getValue()).resolves.toBe('Kyoto');

    field.destroy();
    field.destroy();
    expect(onDestroyRequest).toHaveBeenCalledTimes(2);
  });
});
