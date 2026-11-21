import {
  updateSearchSelectAria,
  updateSearchSelectOptionAria,
} from './search-select-aria.js';
import {
  resolveSearchSelectActiveIndex,
  type SearchSelectNavigationKey,
} from './search-select-keyboard.js';
import {
  formatAnnouncement,
  type SearchSelectMessages,
} from './search-select-messages.js';
import {
  positionSearchSelectListbox,
  resetSearchSelectListboxPosition,
  revealSearchSelectOption,
} from './search-select-positioning.js';

import type { SearchOptionEntry } from './filter-search-options.js';

/** Renders options and manages the active descendant and popup geometry. */
export class SearchSelectListbox<TValue extends string | number> {
  public activeToken: string | undefined;
  public isOpen = false;
  private filteredEntries: readonly SearchOptionEntry<TValue>[] = [];
  private enabledOptionIndices: readonly number[] = [];
  private isPositionTrackingActive = false;
  private readonly optionElementByToken = new Map<string, HTMLDivElement>();
  private readonly optionElementCacheByToken = new Map<string, HTMLDivElement>();

  public constructor(
    private readonly inputElement: HTMLInputElement,
    private readonly listboxElement: HTMLDivElement,
    private readonly resultStatusElement: HTMLDivElement,
    private readonly messages: Readonly<SearchSelectMessages>,
  ) {}

  public open(): void {
    this.isOpen = true;
    this.listboxElement.hidden = false;
    this.inputElement.placeholder = this.messages.searchPlaceholder;
    this.startPositionTracking();
  }

  public close(): void {
    this.isOpen = false;
    this.stopPositionTracking();
    resetSearchSelectListboxPosition(this.listboxElement);
    this.listboxElement.hidden = true;
    this.inputElement.placeholder = this.messages.placeholder;
    this.activeToken = undefined;
    updateSearchSelectAria(this.inputElement, false, undefined);
  }

  public clearCache(): void {
    this.optionElementByToken.clear();
    this.optionElementCacheByToken.clear();
  }

  public retainOptions(tokens: ReadonlySet<string>): void {
    for (const token of this.optionElementCacheByToken.keys()) {
      if (!tokens.has(token)) {
        this.optionElementCacheByToken.delete(token);
      }
    }
  }

  public moveActiveOption(key: SearchSelectNavigationKey): void {
    const activeOptionIndex = this.filteredEntries.findIndex(
      ({ token }) => token === this.activeToken,
    );
    const nextIndex = resolveSearchSelectActiveIndex(
      this.enabledOptionIndices,
      activeOptionIndex < 0 ? undefined : activeOptionIndex,
      key,
    );
    this.setActiveToken(
      nextIndex === undefined ? undefined : this.filteredEntries[nextIndex]?.token,
    );
  }

  public render(
    entries: readonly SearchOptionEntry<TValue>[],
    selectedToken: string | undefined,
  ): void {
    this.filteredEntries = entries;
    this.optionElementByToken.clear();
    this.enabledOptionIndices = this.filteredEntries.flatMap(({ option }, optionIndex) =>
      option.disabled === true ? [] : [optionIndex],
    );
    const optionFragment = document.createDocumentFragment();

    for (const { option, token } of this.filteredEntries) {
      let optionElement = this.optionElementCacheByToken.get(token);
      if (optionElement === undefined) {
        optionElement = document.createElement('div');
        optionElement.className = 'alteditor-lite-search-select__option';
        optionElement.dataset['optionToken'] = token;
        optionElement.id = `${this.listboxElement.id}-${token}`;
        optionElement.tabIndex = -1;
        this.optionElementCacheByToken.set(token, optionElement);
      }

      optionElement.textContent = option.label;
      optionElement.classList.remove('alteditor-lite-search-select__option--active');
      updateSearchSelectOptionAria(
        optionElement,
        token === selectedToken,
        option.disabled ?? false,
      );
      this.optionElementByToken.set(token, optionElement);
      optionFragment.append(optionElement);
    }

    if (this.filteredEntries.length === 0) {
      const noResultsElement = document.createElement('div');
      noResultsElement.className = 'alteditor-lite-search-select__no-results';
      noResultsElement.textContent = this.messages.noResults;
      optionFragment.append(noResultsElement);
      this.listboxElement.replaceChildren(optionFragment);
      this.resultStatusElement.textContent = this.messages.noResults;
      this.position();
      this.setActiveToken(undefined);
      return;
    }

    this.listboxElement.replaceChildren(optionFragment);

    this.resultStatusElement.textContent = formatAnnouncement(this.messages.results, {
      count: String(this.filteredEntries.length),
    });
    const selectedEntry = this.filteredEntries.find(
      ({ option, token }) => token === selectedToken && option.disabled !== true,
    );
    const firstEnabledEntry = this.filteredEntries.find(
      ({ option }) => option.disabled !== true,
    );
    const retainedActiveEntry = this.filteredEntries.find(
      ({ option, token }) => token === this.activeToken && option.disabled !== true,
    );
    this.position();
    this.setActiveToken(
      retainedActiveEntry?.token ?? selectedEntry?.token ?? firstEnabledEntry?.token,
    );
  }

  public renderFeedback(state: 'loading' | 'error' | 'threshold', message: string): void {
    this.filteredEntries = [];
    this.enabledOptionIndices = [];
    this.optionElementByToken.clear();
    const feedback = document.createElement('div');
    feedback.className = `alteditor-lite-search-select__feedback alteditor-lite-search-select__feedback--${state}`;
    feedback.textContent = message;
    this.listboxElement.replaceChildren(feedback);
    this.resultStatusElement.textContent = message;
    this.position();
    this.setActiveToken(undefined);
  }

  private readonly handlePositionChange = (event: Event): void => {
    if (!this.isOpen || event.target === this.listboxElement) {
      return;
    }

    this.position();
    revealSearchSelectOption(
      this.listboxElement,
      this.optionElementByToken.get(this.activeToken ?? ''),
    );
  };

  private setActiveToken(token: string | undefined): void {
    if (this.activeToken !== token) {
      this.optionElementByToken
        .get(this.activeToken ?? '')
        ?.classList.remove('alteditor-lite-search-select__option--active');
    }
    this.optionElementByToken
      .get(token ?? '')
      ?.classList.add('alteditor-lite-search-select__option--active');

    this.activeToken = token;
    const activeOptionElement =
      token === undefined ? undefined : this.optionElementByToken.get(token);
    updateSearchSelectAria(this.inputElement, this.isOpen, activeOptionElement?.id);
    revealSearchSelectOption(this.listboxElement, activeOptionElement);
  }

  private startPositionTracking(): void {
    if (this.isPositionTrackingActive) {
      return;
    }

    this.isPositionTrackingActive = true;
    document.addEventListener('scroll', this.handlePositionChange, true);
    window.addEventListener('resize', this.handlePositionChange);
    window.visualViewport?.addEventListener('resize', this.handlePositionChange);
    window.visualViewport?.addEventListener('scroll', this.handlePositionChange);
  }

  private stopPositionTracking(): void {
    if (!this.isPositionTrackingActive) {
      return;
    }

    this.isPositionTrackingActive = false;
    document.removeEventListener('scroll', this.handlePositionChange, true);
    window.removeEventListener('resize', this.handlePositionChange);
    window.visualViewport?.removeEventListener('resize', this.handlePositionChange);
    window.visualViewport?.removeEventListener('scroll', this.handlePositionChange);
  }

  public position(): void {
    positionSearchSelectListbox(this.inputElement, this.listboxElement);
  }
}
