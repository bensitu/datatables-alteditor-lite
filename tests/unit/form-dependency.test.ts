import { afterEach, describe, expect, it, vi } from 'vitest';

import { EditorConfigurationError } from '../../src/core/alt-editor-lite-error.js';
import { ENGLISH_LANGUAGE } from '../../src/core/alt-editor-lite-language.js';
import { isChoiceFieldController } from '../../src/fields/field-controller.js';
import { buildEditorForm } from '../../src/form/build-editor-form.js';
import { FormDependencyController } from '../../src/form/form-dependency-controller.js';
import { defineFormDependencies } from '../../src/form/form-dependency.js';
import { validateFormDependencies } from '../../src/form/validate-form-dependencies.js';

import type { FieldChangeContext, FieldConfig } from '../../src/fields/field-config.js';
import type { ManagedFieldController } from '../../src/fields/managed-field-controller.js';
import type { FieldRuntimeController } from '../../src/form/field-runtime-controller.js';
import type { EditorFormController } from '../../src/form/form-controller.js';
import type { DependencyFieldBinding } from '../../src/form/form-dependency-controller.js';

interface DependencyValues {
  readonly category: string;
  readonly country: string;
  readonly details: string;
  readonly region: string | undefined;
}

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  resolve(value: TValue): void;
}

function createDeferred<TValue>(): Deferred<TValue> {
  let resolvePromise: ((value: TValue) => void) | undefined;
  const promise = new Promise<TValue>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => {
      resolvePromise?.(value);
    },
  };
}

const activeForms = new Set<EditorFormController<DependencyValues>>();

afterEach(() => {
  for (const form of activeForms) {
    form.destroy();
  }
  activeForms.clear();
  document.body.replaceChildren();
});

function createFields(
  countryChange = vi.fn<
    (value: string, context: FieldChangeContext<DependencyValues>) => void
  >(),
  regionChange = vi.fn<
    (
      value: string | number | undefined,
      context: FieldChangeContext<DependencyValues>,
    ) => void
  >(),
) {
  return [
    {
      defaultValue: 'JP',
      label: 'Country',
      name: 'country',
      onChange: countryChange,
      type: 'text',
    },
    {
      defaultValue: 'business',
      label: 'Category',
      name: 'category',
      type: 'text',
    },
    {
      label: 'Region',
      name: 'region',
      onChange: regionChange,
      options: [{ label: 'Unassigned', value: 'none' }],
      type: 'select',
      visible: false,
    },
    {
      defaultValue: '',
      label: 'Details',
      name: 'details',
      type: 'text',
    },
  ] as const satisfies readonly FieldConfig<DependencyValues>[];
}

function ownForm(
  form: EditorFormController<DependencyValues>,
): EditorFormController<DependencyValues> {
  activeForms.add(form);
  document.body.append(form.element);
  return form;
}

describe('form dependencies', () => {
  it('requires every dependency source to be a rendered field with a resolver', () => {
    expect(() => {
      validateFormDependencies(createFields(), {
        missing: () => ({}),
      } as never);
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFormDependencies(
        [
          ...createFields(),
          {
            editable: false,
            label: 'Omitted',
            name: 'omitted',
            type: 'text',
          },
        ] as never,
        { omitted: () => ({}) },
      );
    }).toThrow(EditorConfigurationError);
    expect(() => {
      validateFormDependencies(createFields(), { country: true } as never);
    }).toThrow(EditorConfigurationError);
  });

  it('merges initial state and applies options before a value without callbacks', async () => {
    const countryChange =
      vi.fn<(value: string, context: FieldChangeContext<DependencyValues>) => void>();
    const regionChange =
      vi.fn<
        (
          value: string | number | undefined,
          context: FieldChangeContext<DependencyValues>,
        ) => void
      >();
    const regionDependency = vi.fn(() => ({}));
    const snapshots: object[] = [];
    const dependencies = defineFormDependencies<DependencyValues>()({
      category: (_value, context) => {
        snapshots.push(context.values);
        return { region: { required: true } };
      },
      country: (value, context) => {
        snapshots.push(context.values);
        const isJapan = value === 'JP';
        return {
          region: {
            options: isJapan
              ? [{ label: 'Tokyo', value: 'tokyo' }]
              : [{ label: 'Ontario', value: 'ontario' }],
            value: isJapan ? 'tokyo' : 'ontario',
            visible: true,
          },
        };
      },
      region: regionDependency,
    });
    const form = ownForm(
      buildEditorForm(
        createFields(countryChange, regionChange),
        'dependency-initial',
        ENGLISH_LANGUAGE,
        undefined,
        undefined,
        dependencies,
      ),
    );

    await form.initializeDependencies();
    const region = form.getField('region');
    if (region === null || !isChoiceFieldController(region)) {
      throw new Error('Expected a choice field.');
    }
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(Object.isFrozen(snapshots[0])).toBe(true);
    expect(region.isVisible()).toBe(true);
    expect(region.isRequired()).toBe(true);
    expect(region.getOptions()).toEqual([{ label: 'Tokyo', value: 'tokyo' }]);
    await expect(region.getValue()).resolves.toBe('tokyo');
    expect(regionChange).not.toHaveBeenCalled();
    expect(regionDependency).toHaveBeenCalledOnce();

    const countryInput = form
      .getField('country')
      ?.element.querySelector<HTMLInputElement>('input');
    if (countryInput === null || countryInput === undefined) {
      throw new Error('Expected a country input.');
    }
    countryInput.value = 'CA';
    countryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(async () => {
      await expect(region.getValue()).resolves.toBe('ontario');
    });
    expect(regionDependency).toHaveBeenCalledOnce();
    expect(regionChange).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(countryChange).toHaveBeenCalledOnce();
    });
    expect(countryChange.mock.calls[0]?.[0]).toBe('CA');
    expect(countryChange.mock.calls[0]?.[1].values).toMatchObject({
      region: 'ontario',
    });
  });

  it('ignores a stale result after cancelling the older source request', async () => {
    const first = createDeferred<{
      readonly details: { readonly value: string };
    }>();
    const second = createDeferred<{
      readonly details: { readonly value: string };
    }>();
    const signals: AbortSignal[] = [];
    let requestCount = 0;
    const form = ownForm(
      buildEditorForm(
        createFields(),
        'dependency-cancellation',
        ENGLISH_LANGUAGE,
        undefined,
        undefined,
        defineFormDependencies<DependencyValues>()({
          country: (_value, { signal }) => {
            signals.push(signal);
            requestCount += 1;
            return requestCount === 1 ? first.promise : second.promise;
          },
        }),
      ),
    );
    const countryInput = form
      .getField('country')
      ?.element.querySelector<HTMLInputElement>('input');
    if (countryInput === null || countryInput === undefined) {
      throw new Error('Expected a country input.');
    }

    countryInput.value = 'first';
    countryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(signals).toHaveLength(1);
    });
    countryInput.value = 'second';
    countryInput.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.waitFor(() => {
      expect(signals).toHaveLength(2);
      expect(signals[0]?.aborted).toBe(true);
    });

    second.resolve({ details: { value: 'latest' } });
    await vi.waitFor(async () => {
      await expect(form.getField('details')?.getValue()).resolves.toBe('latest');
    });
    first.resolve({ details: { value: 'stale' } });
    await Promise.resolve();
    await expect(form.getField('details')?.getValue()).resolves.toBe('latest');
  });

  it('preserves synchronous and non-Error resolver failure details', async () => {
    const synchronousFailure = new Error('Synchronous resolver failure.');
    const normalizedFailures: unknown[] = [];
    const reportedFailures: unknown[] = [];
    let requestCount = 0;
    const controller = new FormDependencyController<DependencyValues>({
      dependencies: defineFormDependencies<DependencyValues>()({
        country: () => {
          requestCount += 1;
          if (requestCount === 1) {
            throw synchronousFailure;
          }
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- verifies consumer-provided rejection handling
          return Promise.reject('remote reason');
        },
      }),
      fields: new Map(),
      lifecycleSignal: new AbortController().signal,
      normalizeError: (error) => {
        normalizedFailures.push(error);
        return new EditorConfigurationError('Resolver unavailable.', { cause: error });
      },
      onErrorChange: (_sourcePath, error) => {
        if (error !== undefined) {
          reportedFailures.push(error);
        }
      },
    });
    const values = {
      category: '',
      country: 'JP',
      details: '',
      region: undefined,
    };

    await controller.handleUserChange('country', values, new AbortController().signal);
    await controller.handleUserChange('country', values, new AbortController().signal);

    expect(normalizedFailures[0]).toBe(synchronousFailure);
    expect(normalizedFailures[1]).toMatchObject({
      cause: 'remote reason',
      message: 'Resolver failed.',
    });
    expect(reportedFailures).toHaveLength(2);
    controller.destroy();
  });

  it('does not report a dependency request cancelled by its parent', async () => {
    const pending = createDeferred<Readonly<Record<string, never>>>();
    let resolverSignal: AbortSignal | undefined;
    const normalizeError = vi.fn(() => new EditorConfigurationError('Unexpected.'));
    const onErrorChange = vi.fn();
    const controller = new FormDependencyController<DependencyValues>({
      dependencies: defineFormDependencies<DependencyValues>()({
        country: (_value, { signal }) => {
          resolverSignal = signal;
          return pending.promise;
        },
      }),
      fields: new Map(),
      lifecycleSignal: new AbortController().signal,
      normalizeError,
      onErrorChange,
    });
    const parent = new AbortController();
    const request = controller.handleUserChange(
      'country',
      { category: '', country: 'JP', details: '', region: undefined },
      parent.signal,
    );
    await vi.waitFor(() => {
      expect(resolverSignal).toBeDefined();
    });

    parent.abort();
    await request;

    expect(resolverSignal?.aborted).toBe(true);
    expect(normalizeError).not.toHaveBeenCalled();
    expect(onErrorChange).not.toHaveBeenCalled();
    pending.resolve({});
    controller.destroy();
  });

  it('stops obsolete field state changes before applying the next dependency result', async () => {
    const firstApplication = createDeferred<undefined>();
    const applications: string[] = [];
    const setVisible = vi.fn();
    const detailsConfig = {
      defaultValue: '',
      label: 'Details',
      name: 'details',
      type: 'text',
    } as const satisfies FieldConfig<DependencyValues>;
    const binding: DependencyFieldBinding<DependencyValues> = {
      config: detailsConfig,
      controller: {} as ManagedFieldController<DependencyValues>,
      runtime: { setVisible } as unknown as FieldRuntimeController<DependencyValues>,
    };
    const lifecycleAbortController = new AbortController();
    const resolver = vi.fn((value: string) => ({
      details: { value, visible: value === 'second' },
    }));
    const controller = new FormDependencyController<DependencyValues>({
      applyValue: async (_targetPath, _binding, value) => {
        applications.push(`${String(value)}:start`);
        if (value === 'first') {
          await firstApplication.promise;
        }
        applications.push(`${String(value)}:end`);
      },
      dependencies: defineFormDependencies<DependencyValues>()({
        country: resolver,
      }),
      fields: new Map<string, DependencyFieldBinding<DependencyValues>>([
        ['details', binding],
      ]),
      lifecycleSignal: lifecycleAbortController.signal,
      normalizeError: (error) => {
        throw error;
      },
      onErrorChange: vi.fn(),
    });
    const parentSignal = new AbortController().signal;
    const firstRequest = controller.handleUserChange(
      'country',
      { category: '', country: 'first', details: '', region: undefined },
      parentSignal,
    );
    await vi.waitFor(() => {
      expect(applications).toEqual(['first:start']);
    });

    const secondRequest = controller.handleUserChange(
      'country',
      { category: '', country: 'second', details: '', region: undefined },
      parentSignal,
    );
    await vi.waitFor(() => {
      expect(resolver).toHaveBeenCalledTimes(2);
    });
    expect(applications).toEqual(['first:start']);

    firstApplication.resolve(undefined);
    await Promise.all([firstRequest, secondRequest]);

    expect(applications).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
    expect(setVisible.mock.calls).toEqual([[true]]);
    controller.destroy();
  });

  it('rejects conflicting initial assignments before changing field state', async () => {
    const form = ownForm(
      buildEditorForm(
        createFields(),
        'dependency-conflict',
        ENGLISH_LANGUAGE,
        undefined,
        undefined,
        defineFormDependencies<DependencyValues>()({
          category: () => ({ region: { visible: false } }),
          country: () => ({ region: { visible: true } }),
        }),
      ),
    );

    await expect(form.initializeDependencies()).rejects.toThrow(EditorConfigurationError);
    expect(form.getField('region')?.isVisible()).toBe(false);
  });

  it('validates the complete patch before applying any target change', async () => {
    const form = ownForm(
      buildEditorForm(
        createFields(),
        'dependency-atomicity',
        ENGLISH_LANGUAGE,
        undefined,
        undefined,
        defineFormDependencies<DependencyValues>()({
          country: () => ({
            details: {
              options: [{ label: 'Invalid target', value: 'invalid' }],
            },
            region: { visible: true },
          }),
        }),
      ),
    );

    await expect(form.initializeDependencies()).rejects.toThrow(EditorConfigurationError);
    expect(form.getField('region')?.isVisible()).toBe(false);
  });
});
