/** Keys that move the active SearchSelect option. */
export type SearchSelectNavigationKey = 'ArrowDown' | 'ArrowUp' | 'End' | 'Home';

/**
 * Resolves the next enabled option index for one navigation key.
 *
 * @param enabledOptionIndices - Rendered indices that are not disabled.
 * @param activeOptionIndex - Currently active rendered index.
 * @param key - Navigation key.
 * @returns The next active index, or undefined when none are enabled.
 */
export function resolveSearchSelectActiveIndex(
  enabledOptionIndices: readonly number[],
  activeOptionIndex: number | undefined,
  key: SearchSelectNavigationKey,
): number | undefined {
  if (enabledOptionIndices.length === 0) {
    return undefined;
  }

  if (key === 'Home') {
    return enabledOptionIndices[0];
  }

  if (key === 'End') {
    return enabledOptionIndices[enabledOptionIndices.length - 1];
  }

  const activePosition =
    activeOptionIndex === undefined
      ? -1
      : enabledOptionIndices.indexOf(activeOptionIndex);

  if (key === 'ArrowDown') {
    const nextPosition = activePosition + 1;
    return enabledOptionIndices[nextPosition] ?? enabledOptionIndices[0];
  }

  const previousPosition =
    activePosition <= 0 ? enabledOptionIndices.length - 1 : activePosition - 1;
  return enabledOptionIndices[previousPosition];
}

/**
 * Reports whether composition must block Enter selection and submission.
 *
 * @param isComposing - Current composition state.
 * @param key - KeyboardEvent key.
 * @returns Whether Enter belongs to an active IME composition.
 */
export function isComposingEnter(isComposing: boolean, key: string): boolean {
  return isComposing && key === 'Enter';
}
