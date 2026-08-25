import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveLanguage } from '../../src/core/alt-editor-lite-language.js';
import { loadEditorLanguage } from '../../src/localization/editor-language-resource.js';
import { getLocale, registerLocale } from '../../src/localization/locale-registry.js';

import type { EditorLanguageLoadError } from '../../src/core/alt-editor-lite-error.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('external editor language resources', () => {
  it('rejects invalid inline language values at runtime', () => {
    expect(() => resolveLanguage({ actions: { create: 42 } } as never)).toThrow(
      'Editor language overrides must be non-empty strings.',
    );
    expect(() => resolveLanguage({ locale: 'invalid_locale' })).toThrow(
      'Editor language locale must be a valid BCP 47 identifier.',
    );
  });

  it('loads partial JSON, canonicalizes its locale, and applies English fallbacks', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          actions: { create: 'Créer' },
          locale: 'fr-fr',
          searchSelect: { noResults: 'Aucun résultat' },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const requestInit = { credentials: 'same-origin' } as const;

    const language = await loadEditorLanguage('/languages/fr-FR.json', requestInit);

    expect(fetchMock).toHaveBeenCalledOnce();
    const fetchCall = fetchMock.mock.calls[0];
    expect(fetchCall?.[0]).toBe('/languages/fr-FR.json');
    expect(fetchCall?.[1]?.credentials).toBe(requestInit.credentials);
    expect(fetchCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(language).toMatchObject({
      actions: { cancel: 'Cancel', create: 'Créer' },
      locale: 'fr-FR',
      searchSelect: { noResults: 'Aucun résultat' },
    });
  });

  it('wraps network failures as retryable without exposing their message', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('private network detail'));
    vi.stubGlobal('fetch', fetchMock);

    const loadRequest = loadEditorLanguage('/unreachable');

    await expect(loadRequest).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'The requested editor language could not be loaded.',
      retryable: true,
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: 'no-cache',
      credentials: 'omit',
    });
  });

  it('rejects unsupported and credential-bearing language resource URLs', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      loadEditorLanguage('data:application/json,{"locale":"en"}'),
    ).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'Editor language resources must use an HTTP or HTTPS URL.',
      retryable: false,
    });
    await expect(
      loadEditorLanguage('//example.test/language.json'),
    ).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'Editor language resources must not use a protocol-relative URL.',
      retryable: false,
    });
    await expect(
      loadEditorLanguage('https://reader:secret@example.test/language.json'),
    ).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'Editor language resource URLs must not contain embedded credentials.',
      retryable: false,
    });
    await expect(loadEditorLanguage('java\nscript:alert(1)')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'Editor language resources must not contain control characters.',
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports invalid JSON and invalid placeholders as non-retryable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{', {
          headers: { 'content-type': 'application/json; charset=utf-8' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dialog: { removeCount: 'Selected rows.' },
            locale: 'en-GB',
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadEditorLanguage('/invalid-json')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      retryable: false,
    });
    await expect(loadEditorLanguage('/invalid-language')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      retryable: false,
    });
  });

  it('rejects a successful response with a non-JSON media type', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('<html lang="en"></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadEditorLanguage('/unexpected-content')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'The editor language response must use a JSON media type.',
      retryable: false,
    });
  });

  it('classifies HTTP failures without exposing response content', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('missing', { status: 404 }))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadEditorLanguage('/missing')).rejects.toEqual(
      expect.objectContaining<Partial<EditorLanguageLoadError>>({
        code: 'LANGUAGE_LOAD',
        retryable: false,
      }),
    );
    await expect(loadEditorLanguage('/unavailable')).rejects.toEqual(
      expect.objectContaining<Partial<EditorLanguageLoadError>>({
        code: 'LANGUAGE_LOAD',
        retryable: true,
      }),
    );
  });

  it('limits response size and aborts requests that exceed the default timeout', async () => {
    const largeLanguageResource = `${JSON.stringify({ locale: 'en-US' })}${' '.repeat(70 * 1024)}`;
    const oversizedFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(largeLanguageResource, {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(largeLanguageResource, {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', oversizedFetch);

    await expect(loadEditorLanguage('/oversized')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'The editor language response exceeds the supported size.',
      retryable: false,
    });

    await expect(
      loadEditorLanguage('/larger-language', { maxResourceBytes: 80 * 1024 }),
    ).resolves.toMatchObject({ locale: 'en-US' });
    expect(oversizedFetch.mock.calls[1]?.[1]).not.toHaveProperty('maxResourceBytes');
    await expect(
      loadEditorLanguage('/invalid-limit', { maxResourceBytes: 0 }),
    ).rejects.toThrow(
      'Editor language maxResourceBytes must be a positive safe integer.',
    );
    expect(oversizedFetch).toHaveBeenCalledTimes(2);

    vi.useFakeTimers();
    const pendingFetch = vi.fn<typeof fetch>().mockImplementation(
      async (_resource, requestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          requestInit?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Request aborted.', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', pendingFetch);
    const timeoutResult = expect(loadEditorLanguage('/slow')).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'The editor language request timed out.',
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(10_000);
    await timeoutResult;

    const callerAbortController = new AbortController();
    const callerAbortResult = expect(
      loadEditorLanguage('/cancelled', { signal: callerAbortController.signal }),
    ).rejects.toMatchObject({
      code: 'LANGUAGE_LOAD',
      message: 'The requested editor language could not be loaded.',
      retryable: true,
    });
    callerAbortController.abort(new DOMException('Cancelled.', 'AbortError'));
    vi.advanceTimersByTime(10_000);
    await callerAbortResult;
  });

  it('registers application languages by canonical BCP 47 identifier', () => {
    const language = registerLocale({
      actions: { create: 'Criar' },
      locale: 'pt-br',
    });

    expect(language).toMatchObject({
      actions: { cancel: 'Cancel', create: 'Criar' },
      locale: 'pt-BR',
    });
    expect(getLocale('PT-br')).toBe(language);
    expect(getLocale('invalid_locale')).toBeUndefined();
  });
});
