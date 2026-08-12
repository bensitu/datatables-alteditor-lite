import { EditorConfigurationError } from '../../core/alt-editor-lite-error.js';

import type { DialogTemplateSource } from '../../core/editing-options.js';

function resolveSourceElement(source: DialogTemplateSource): HTMLElement {
  if (typeof source !== 'string') {
    if (!(source instanceof HTMLElement)) {
      throw new EditorConfigurationError(
        'editing.dialog.template must be a selector or an HTMLElement.',
      );
    }
    return source;
  }

  let resolvedElement: Element | null;
  try {
    resolvedElement = document.querySelector(source);
  } catch (error: unknown) {
    throw new EditorConfigurationError(
      'editing.dialog.template must contain a valid selector.',
      error,
    );
  }

  if (resolvedElement === null) {
    throw new EditorConfigurationError(
      `editing.dialog.template selector "${source}" did not match an element.`,
    );
  }
  if (!(resolvedElement instanceof HTMLElement)) {
    throw new EditorConfigurationError(
      'editing.dialog.template must resolve to an HTMLElement.',
    );
  }
  return resolvedElement;
}

/** Resolves and deeply clones a consumer-owned dialog layout source. */
export function resolveTemplateSource(source: DialogTemplateSource): DocumentFragment {
  const sourceElement = resolveSourceElement(source);
  const fragment = document.createDocumentFragment();
  fragment.append(
    sourceElement instanceof HTMLTemplateElement
      ? sourceElement.content.cloneNode(true)
      : sourceElement.cloneNode(true),
  );
  return fragment;
}
