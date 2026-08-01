import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadEditorLanguage } from '../../src/localization/editor-language-resource.js';
import { getLocale, registerLocale } from '../../src/localization/locale-registry.js';

import type { EditorLanguageLoadError } from '../../src/core/alt-editor-lite-error.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('external editor language resources', () => {
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

    expect(fetchMock).toHaveBeenCalledWith('/languages/fr-FR.json', requestInit);
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
    await expect(loadRequest).rejects.not.toHaveProperty(
      'message',
      expect.stringContaining('private network detail'),
    );
  });

  it('reports invalid JSON and invalid placeholders as non-retryable', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            dialog: { removeCount: 'Selected rows.' },
            locale: 'en-GB',
          }),
          { status: 200 },
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
