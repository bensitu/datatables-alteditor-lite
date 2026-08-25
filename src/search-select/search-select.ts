import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { ChoiceOptionStore } from '../fields/choice-option-store.js';

import { filterSearchOptions } from './filter-search-options.js';
import {
  initializeSearchSelectAria,
  updateSearchSelectAria,
  updateSearchSelectOptionAria,
} from './search-select-aria.js';
import {
  isComposingEnter,
  resolveSearchSelectActiveIndex,
  type SearchSelectNavigationKey,
} from './search-select-keyboard.js';
import { revealSearchSelectOption } from './search-select-positioning.js';

import type { SearchOptionEntry } from './filter-search-options.js';
import type { SelectOption } from '../fields/field-config.js';
import type {
  SearchSelectOptionLoader,
  SearchSelectOptionResolver,
} from '../fields/search-select-data-source.js';

/** Maximum supported local option count without virtualization. */
export const SEARCH_SELECT_MAX_OPTION_COUNT = 5000;

/** Localized text consumed by a SearchSelect instance. */
export interface SearchSelectMessages {
  readonly clear: string;
  readonly instructions: string;
  readonly noResults: string;
  readonly placeholder: string;
  readonly results: string;
  readonly searchPlaceholder: string;
  readonly selection: string;
  readonly loading: string;
  readonly loadError: string;
  readonly searchTooShort: string;
}

/** Construction arguments for one local single-value SearchSelect. */
export interface SearchSelectArguments<TValue extends string | number> {
  readonly allowClear: boolean;
  readonly allowManualValue: boolean;
  readonly debounceMs: number;
  readonly fieldId: string;
  readonly locale: string;
  readonly messages: Readonly<SearchSelectMessages>;
  readonly onCommit: () => void;
  readonly options?: readonly SelectOption<TValue>[];
  readonly loadOptions?: SearchSelectOptionLoader<TValue>;
  readonly resolveOption?: SearchSelectOptionResolver<TValue>;
  readonly searchEnabled?: boolean;
  readonly searchThreshold: number;
  readonly sortOptions: boolean;
}

type DocumentPointerDownSubscriber = (event: PointerEvent) => void;

const documentPointerDownSubscribers = new Set<DocumentPointerDownSubscriber>();

function dispatchDocumentPointerDown(event: PointerEvent): void {
  for (const subscriber of [...documentPointerDownSubscribers]) {
    subscriber(event);
  }
}

function subscribeToDocumentPointerDown(
  subscriber: DocumentPointerDownSubscriber,
): () => void {
  if (documentPointerDownSubscribers.size === 0) {
    document.addEventListener('pointerdown', dispatchDocumentPointerDown);
  }
  documentPointerDownSubscribers.add(subscriber);

  return () => {
    documentPointerDownSubscribers.delete(subscriber);
    if (documentPointerDownSubscribers.size === 0) {
      document.removeEventListener('pointerdown', dispatchDocumentPointerDown);
    }
  };
}

function isNavigationKey(key: string): key is SearchSelectNavigationKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End';
}

function formatAnnouncement(
  template: string,
  replacements: Readonly<Record<string, string>>,
): string {
  let announcement = template;
  for (const [tokenName, replacement] of Object.entries(replacements)) {
    announcement = announcement.replaceAll(`{${tokenName}}`, replacement);
  }
  return announcement;
}

function assertSupportedOptionCount(optionCount: number): void {
  if (optionCount > SEARCH_SELECT_MAX_OPTION_COUNT) {
    throw new EditorConfigurationError(
      `SearchSelect supports at most ${String(SEARCH_SELECT_MAX_OPTION_COUNT)} local options.`,
    );
  }
}

/**
 * Native DOM SearchSelect with typed local options, keyboard support, and IME safety.
 */
export class SearchSelect<TValue extends string | number> {
  public readonly element: HTMLDivElement;

  public readonly inputElement: HTMLInputElement;

  public readonly instructionsId: string;

  public readonly listboxElement: HTMLDivElement;

  private activeToken: string | undefined;

  private debounceTimerId: ReturnType<typeof globalThis.setTimeout> | undefined;

  private filteredEntries: readonly SearchOptionEntry<TValue>[] = [];

  private enabledOptionIndices: readonly number[] = [];

  private isComposing = false;

  private isDestroyed = false;

  private isOpen = false;

  private readOnlyState = false;

  private isLoading = false;

  private isResolving = false;

  private manualValue: string | undefined;

  private readonly clearButtonElement: HTMLButtonElement;

  private readonly listboxId: string;

  private readonly messages: Readonly<SearchSelectMessages>;

  private readonly onCommit: () => void;

  private readonly loadOptions: SearchSelectOptionLoader<TValue> | undefined;

  private readonly resolveOption: SearchSelectOptionResolver<TValue> | undefined;

  private readonly optionElementByToken = new Map<string, HTMLDivElement>();

  private readonly optionElementCacheByToken = new Map<string, HTMLDivElement>();

  private readonly resultStatusElement: HTMLDivElement;

  private readonly shouldAllowClear: boolean;

  private readonly shouldAllowManualValue: boolean;

  private readonly shouldSortOptions: boolean;

  private readonly isSearchEnabled: boolean;

  private readonly locale: string;

  private readonly searchThreshold: number;

  private readonly debounceMs: number;

  private readonly unsubscribeDocumentPointerDown: () => void;

  private selectedToken: string | undefined;

  private selectedValue: TValue | undefined;

  private selectedResolvedOption: SelectOption<TValue> | undefined;

  private seedOptions: readonly SelectOption<TValue>[];

  private currentRemoteOptions: readonly SelectOption<TValue>[] = [];

  private searchAbortController: AbortController | undefined;

  private resolveAbortController: AbortController | undefined;

  private searchRevision = 0;

  private resolveRevision = 0;

  private tokenMap: ChoiceOptionStore<TValue>;

  private isRequiredState = false;

  /** Creates an unmounted SearchSelect subtree. */
  public constructor(configuration: SearchSelectArguments<TValue>) {
    const options = configuration.options ?? [];
    assertSupportedOptionCount(options.length);
    if (
      (configuration.loadOptions === undefined) !==
      (configuration.resolveOption === undefined)
    ) {
      throw new EditorConfigurationError(
        'Remote SearchSelect requires loadOptions and resolveOption.',
      );
    }
    this.isSearchEnabled = configuration.searchEnabled ?? true;
    if (!this.isSearchEnabled && configuration.loadOptions !== undefined) {
      throw new EditorConfigurationError(
        'Remote SearchSelect requires search to be enabled.',
      );
    }
    this.tokenMap = new ChoiceOptionStore(options);
    this.seedOptions = this.tokenMap.options();
    this.shouldAllowClear = configuration.allowClear;
    this.shouldAllowManualValue = configuration.allowManualValue;
    this.shouldSortOptions = configuration.sortOptions;
    this.locale = configuration.locale;
    this.searchThreshold = configuration.searchThreshold;
    this.debounceMs = configuration.debounceMs;
    this.messages = configuration.messages;
    this.onCommit = configuration.onCommit;
    this.loadOptions = configuration.loadOptions;
    this.resolveOption = configuration.resolveOption;
    this.listboxId = `${configuration.fieldId}-listbox`;
    this.instructionsId = `${configuration.fieldId}-instructions`;

    this.element = document.createElement('div');
    this.element.className = 'alteditor-lite-search-select';
    this.element.setAttribute('aria-busy', 'false');

    this.inputElement = document.createElement('input');
    this.inputElement.type = 'text';
    this.inputElement.readOnly = !this.isSearchEnabled;
    this.inputElement.placeholder = this.messages.placeholder;

    this.clearButtonElement = document.createElement('button');
    this.clearButtonElement.className = 'alteditor-lite-search-select__clear';
    this.clearButtonElement.type = 'button';
    this.clearButtonElement.textContent = '×';
    this.clearButtonElement.setAttribute('aria-label', this.messages.clear);
    this.clearButtonElement.hidden = true;

    this.listboxElement = document.createElement('div');
    this.listboxElement.className = 'alteditor-lite-search-select__listbox';
    this.listboxElement.id = this.listboxId;
    this.listboxElement.hidden = true;

    const instructionsElement = document.createElement('div');
    instructionsElement.className = 'alteditor-lite-visually-hidden';
    instructionsElement.id = this.instructionsId;
    instructionsElement.textContent = this.messages.instructions;

    this.resultStatusElement = document.createElement('div');
    this.resultStatusElement.className = 'alteditor-lite-visually-hidden';
    this.resultStatusElement.setAttribute('role', 'status');
    this.resultStatusElement.setAttribute('aria-live', 'polite');

    initializeSearchSelectAria(
      this.inputElement,
      this.listboxElement,
      this.isSearchEnabled,
    );
    this.element.append(
      this.inputElement,
      this.clearButtonElement,
      this.listboxElement,
      instructionsElement,
      this.resultStatusElement,
    );

    this.inputElement.addEventListener('focus', this.handleFocus);
    this.element.addEventListener('focusout', this.handleFocusOut);
    this.inputElement.addEventListener('input', this.handleInput);
    this.inputElement.addEventListener('keydown', this.handleKeyDown);
    this.inputElement.addEventListener('compositionstart', this.handleCompositionStart);
    this.inputElement.addEventListener('compositionend', this.handleCompositionEnd);
    this.clearButtonElement.addEventListener('mousedown', this.handleClearMouseDown);
    this.clearButtonElement.addEventListener('click', this.handleClearClick);
    this.listboxElement.addEventListener('mousedown', this.handleOptionMouseDown);
    this.unsubscribeDocumentPointerDown = subscribeToDocumentPointerDown(
      this.handleDocumentPointerDown,
    );
  }

  /** Reads the exact selected option value or committed manual string. */
  public getValue(): TValue | string | undefined {
    return this.selectedValue ?? this.manualValue;
  }

  /** Returns the current immutable local or seed option snapshot. */
  public getOptions(): readonly SelectOption<TValue>[] {
    return this.seedOptions;
  }

  /** Writes an exact option value, manual string, or clear state. */
  public setValue(value: unknown): void {
    if (value === undefined) {
      this.clear(false);
      return;
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new EditorConfigurationError(
        'SearchSelect values must be configured strings or numbers.',
      );
    }

    const typedValue = value as TValue;
    const option = this.findKnownOption(typedValue);
    const token = this.tokenMap.tokenForValue(typedValue);
    if (option !== undefined) {
      this.selectedValue = typedValue;
      this.selectedResolvedOption = option;
      this.selectedToken = token;
      this.manualValue = undefined;
      this.inputElement.value = option.label;
      this.cancelResolveRequest();
      this.updateClearButton();
      if (this.isOpen) {
        this.renderOptions('');
      }
      return;
    }

    if (this.isRemote()) {
      this.selectedValue = typedValue;
      this.selectedResolvedOption = undefined;
      this.selectedToken = undefined;
      this.manualValue = undefined;
      this.inputElement.value = '';
      this.updateClearButton();
      this.startResolve(typedValue);
      return;
    }

    if (this.shouldAllowManualValue && typeof value === 'string') {
      this.selectedToken = undefined;
      this.selectedValue = undefined;
      this.selectedResolvedOption = undefined;
      this.manualValue = value;
      this.inputElement.value = value;
      this.updateClearButton();
      if (this.isOpen) {
        this.renderOptions('');
      }
      return;
    }

    throw new EditorConfigurationError(
      'SearchSelect received an unknown configured option value.',
    );
  }

  /** Rebuilds typed option tokens while retaining a still-present value. */
  public setOptions(options: readonly SelectOption<TValue>[]): void {
    assertSupportedOptionCount(options.length);
    if (
      this.shouldAllowManualValue &&
      options.some(({ value }) => typeof value !== 'string')
    ) {
      throw new EditorConfigurationError(
        'SearchSelect manual values require string-valued options.',
      );
    }
    if (this.isRemote()) {
      this.assertRemoteOptions(options);
      const seedOptionStore = new ChoiceOptionStore(options);
      this.seedOptions = seedOptionStore.options();
      if (this.currentRemoteOptions.length === 0) {
        this.tokenMap = seedOptionStore;
        this.selectedToken =
          this.selectedValue === undefined
            ? undefined
            : seedOptionStore.tokenForValue(this.selectedValue);
      }
      const selectedValue = this.selectedValue;
      if (selectedValue !== undefined) {
        const selectedOption = this.findOption(options, selectedValue);
        if (selectedOption !== undefined) {
          this.cancelResolveRequest();
          this.selectedResolvedOption = selectedOption;
          this.inputElement.value = selectedOption.label;
        } else if (
          this.selectedResolvedOption === undefined &&
          this.resolveAbortController === undefined
        ) {
          this.startResolve(selectedValue);
        }
      }
      if (this.isOpen && this.currentRemoteOptions.length === 0) {
        this.setCurrentOptions(options);
        this.filteredEntries = this.tokenMap.entries().map(([token, option]) => ({
          option,
          token,
        }));
        this.renderOptionElements();
      }
      return;
    }

    const previousSelectedValue = this.selectedValue;
    const nextTokenMap = new ChoiceOptionStore(options);
    this.seedOptions = nextTokenMap.options();
    this.tokenMap = nextTokenMap;
    this.optionElementByToken.clear();
    this.optionElementCacheByToken.clear();
    this.listboxElement.replaceChildren();

    if (previousSelectedValue !== undefined) {
      const nextToken = nextTokenMap.tokenForValue(previousSelectedValue);
      if (nextToken === undefined) {
        this.clear(false);
      } else {
        this.selectedToken = nextToken;
        this.selectedValue = previousSelectedValue;
        this.selectedResolvedOption = nextTokenMap.optionForToken(nextToken);
        this.inputElement.value = nextTokenMap.optionForToken(nextToken)?.label ?? '';
      }
    }

    if (this.isOpen) {
      this.renderOptions(this.getValue() === undefined ? this.inputElement.value : '');
    }
  }

  /** Updates the disabled state and closes an unavailable listbox. */
  public setDisabled(isDisabled: boolean): void {
    this.inputElement.disabled = isDisabled;
    this.clearButtonElement.disabled = isDisabled || this.readOnlyState;
    if (isDisabled) {
      this.close();
    }
  }

  public isDisabled(): boolean {
    return this.inputElement.disabled;
  }

  /** Updates readonly semantics without omitting the current value. */
  public setReadOnly(isReadOnly: boolean): void {
    this.readOnlyState = isReadOnly;
    this.inputElement.readOnly = isReadOnly || !this.isSearchEnabled;
    this.inputElement.setAttribute('aria-readonly', String(isReadOnly));
    this.clearButtonElement.disabled = isReadOnly || this.inputElement.disabled;
    if (isReadOnly) {
      this.close();
    }
  }

  public isReadOnly(): boolean {
    return this.readOnlyState;
  }

  /** Updates required-value validation without rebuilding the component. */
  public setRequired(isRequired: boolean): void {
    this.isRequiredState = isRequired;
    this.inputElement.required = isRequired;
    this.inputElement.setAttribute('aria-required', String(isRequired));
  }

  public isRequired(): boolean {
    return this.isRequiredState;
  }

  /** Removes all owned listeners and pending local filtering work. */
  public destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    this.isDestroyed = true;
    this.cancelScheduledRender();
    this.cancelSearchRequest();
    this.cancelResolveRequest();
    this.inputElement.removeEventListener('focus', this.handleFocus);
    this.element.removeEventListener('focusout', this.handleFocusOut);
    this.inputElement.removeEventListener('input', this.handleInput);
    this.inputElement.removeEventListener('keydown', this.handleKeyDown);
    this.inputElement.removeEventListener(
      'compositionstart',
      this.handleCompositionStart,
    );
    this.inputElement.removeEventListener('compositionend', this.handleCompositionEnd);
    this.clearButtonElement.removeEventListener('mousedown', this.handleClearMouseDown);
    this.clearButtonElement.removeEventListener('click', this.handleClearClick);
    this.listboxElement.removeEventListener('mousedown', this.handleOptionMouseDown);
    this.unsubscribeDocumentPointerDown();
    updateSearchSelectAria(this.inputElement, false, undefined);
    this.inputElement.removeAttribute('aria-autocomplete');
    this.inputElement.removeAttribute('aria-controls');
    this.inputElement.removeAttribute('aria-expanded');
    this.optionElementByToken.clear();
    this.optionElementCacheByToken.clear();
    this.listboxElement.replaceChildren();
  }

  private readonly handleFocusOut = (event: FocusEvent): void => {
    if (
      event.relatedTarget instanceof Node &&
      this.element.contains(event.relatedTarget)
    ) {
      return;
    }

    this.commitManualValue();
    if (this.getValue() === undefined) {
      this.inputElement.value = '';
    }
    this.close();
  };

  private readonly handleClearClick = (): void => {
    this.clear(true);
    this.inputElement.focus();
  };

  private readonly handleClearMouseDown = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly handleCompositionEnd = (): void => {
    if (!this.isSearchEnabled) {
      return;
    }
    this.isComposing = false;
    this.scheduleRender();
  };

  private readonly handleCompositionStart = (): void => {
    if (!this.isSearchEnabled) {
      return;
    }
    this.isComposing = true;
    this.cancelScheduledRender();
  };

  private readonly handleDocumentPointerDown = (event: PointerEvent): void => {
    if (event.target instanceof Node && !this.element.contains(event.target)) {
      this.commitManualValue();
      this.close();
    }
  };

  private readonly handleFocus = (): void => {
    if (
      this.isRemote() &&
      this.selectedValue !== undefined &&
      this.selectedResolvedOption === undefined &&
      this.resolveAbortController === undefined
    ) {
      this.startResolve(this.selectedValue);
    }
    this.open();
  };

  private readonly handleInput = (): void => {
    if (!this.isSearchEnabled) {
      return;
    }
    const hasCommittedValue = this.getValue() !== undefined;
    this.cancelResolveRequest();
    this.selectedToken = undefined;
    this.selectedValue = undefined;
    this.selectedResolvedOption = undefined;
    this.manualValue = undefined;
    this.updateClearButton();

    if (hasCommittedValue) {
      this.onCommit();
    }

    if (!this.isComposing) {
      this.scheduleRender();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.inputElement.disabled || this.readOnlyState) {
      return;
    }

    const isImeEnter = isComposingEnter(this.isComposing || event.isComposing, event.key);
    if (isImeEnter) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (isNavigationKey(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const isListboxOpen = this.isOpen;
      if (!isListboxOpen) {
        this.open();
      }
      if (isListboxOpen || event.key !== 'ArrowDown') {
        this.moveActiveOption(event.key);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!this.isOpen) {
        this.open();
      } else if (this.activeToken !== undefined) {
        this.selectToken(this.activeToken);
      } else {
        this.commitManualValue();
        this.close();
      }
      return;
    }

    if (event.key === 'Escape' && this.isOpen) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    if (
      event.key === 'Backspace' &&
      this.isSearchEnabled &&
      this.inputElement.value.length === 0 &&
      this.shouldAllowClear
    ) {
      this.clear(true);
      return;
    }

    if (event.key === 'Tab') {
      this.commitManualValue();
      if (this.getValue() === undefined) {
        this.inputElement.value = '';
      }
      this.close();
    }
  };

  private readonly handleOptionMouseDown = (event: MouseEvent): void => {
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element)) {
      return;
    }

    const optionElement = eventTarget.closest<HTMLElement>('[data-option-token]');
    const token = optionElement?.dataset['optionToken'];
    if (token === undefined || optionElement?.getAttribute('aria-disabled') === 'true') {
      return;
    }

    event.preventDefault();
    this.selectToken(token);
  };

  private cancelScheduledRender(): void {
    if (this.debounceTimerId !== undefined) {
      globalThis.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = undefined;
    }
  }

  private clear(shouldNotify: boolean): void {
    const hasCommittedValue = this.getValue() !== undefined;
    this.cancelResolveRequest();
    this.selectedToken = undefined;
    this.selectedValue = undefined;
    this.selectedResolvedOption = undefined;
    this.manualValue = undefined;
    this.activeToken = undefined;
    this.inputElement.value = '';
    this.updateClearButton();
    if (this.isOpen) {
      this.renderOptions('');
    } else {
      updateSearchSelectAria(this.inputElement, false, undefined);
    }

    if (shouldNotify && hasCommittedValue) {
      this.onCommit();
    }
  }

  private close(): void {
    this.cancelSearchRequest();
    this.isOpen = false;
    this.listboxElement.hidden = true;
    this.inputElement.placeholder = this.messages.placeholder;
    this.activeToken = undefined;
    updateSearchSelectAria(this.inputElement, false, undefined);
  }

  private commitManualValue(): void {
    if (!this.shouldAllowManualValue || this.selectedValue !== undefined) {
      return;
    }

    const nextManualValue = this.inputElement.value;
    if (nextManualValue.trim().length === 0) {
      this.manualValue = undefined;
      this.updateClearButton();
      return;
    }

    const previousManualValue = this.manualValue;
    this.manualValue = nextManualValue;
    this.updateClearButton();
    if (previousManualValue !== nextManualValue) {
      this.onCommit();
    }
  }

  private moveActiveOption(key: SearchSelectNavigationKey): void {
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

  private open(): void {
    if (this.inputElement.disabled || this.readOnlyState) {
      return;
    }

    this.isOpen = true;
    this.listboxElement.hidden = false;
    this.inputElement.placeholder = this.messages.searchPlaceholder;
    this.renderOptions(
      this.isSearchEnabled && this.getValue() === undefined
        ? this.inputElement.value
        : '',
    );
  }

  private renderOptions(query: string): void {
    if (this.isRemote()) {
      this.startRemoteSearch(query);
      return;
    }
    const entries = this.tokenMap.entries().map(([token, option]) => ({
      option,
      token,
    }));
    this.filteredEntries = filterSearchOptions(
      entries,
      query,
      this.locale,
      this.searchThreshold,
      this.shouldSortOptions,
    );
    this.renderOptionElements();
  }

  private renderOptionElements(): void {
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
        optionElement.id = `${this.listboxId}-${token}`;
        optionElement.tabIndex = -1;
        this.optionElementCacheByToken.set(token, optionElement);
      }

      optionElement.textContent = option.label;
      optionElement.classList.remove('alteditor-lite-search-select__option--active');
      updateSearchSelectOptionAria(
        optionElement,
        token === this.selectedToken,
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
      this.setActiveToken(undefined);
      return;
    }

    this.listboxElement.replaceChildren(optionFragment);

    this.resultStatusElement.textContent = formatAnnouncement(this.messages.results, {
      count: String(this.filteredEntries.length),
    });
    const selectedEntry = this.filteredEntries.find(
      ({ option, token }) => token === this.selectedToken && option.disabled !== true,
    );
    const firstEnabledEntry = this.filteredEntries.find(
      ({ option }) => option.disabled !== true,
    );
    const retainedActiveEntry = this.filteredEntries.find(
      ({ option, token }) => token === this.activeToken && option.disabled !== true,
    );
    this.setActiveToken(
      retainedActiveEntry?.token ?? selectedEntry?.token ?? firstEnabledEntry?.token,
    );
  }

  private scheduleRender(): void {
    this.cancelScheduledRender();
    this.isOpen = true;
    this.listboxElement.hidden = false;
    this.inputElement.placeholder = this.messages.searchPlaceholder;

    if (this.debounceMs === 0) {
      this.renderOptions(this.isSearchEnabled ? this.inputElement.value : '');
      return;
    }

    this.debounceTimerId = globalThis.setTimeout(() => {
      this.debounceTimerId = undefined;
      if (!this.isDestroyed && !this.isComposing) {
        this.renderOptions(this.isSearchEnabled ? this.inputElement.value : '');
      }
    }, this.debounceMs);
  }

  private selectToken(token: string): void {
    const option = this.tokenMap.optionForToken(token);
    if (option === undefined || option.disabled === true) {
      return;
    }

    this.selectedToken = token;
    this.selectedValue = option.value;
    this.selectedResolvedOption = option;
    this.cancelResolveRequest();
    this.manualValue = undefined;
    this.inputElement.value = option.label;
    this.resultStatusElement.textContent = formatAnnouncement(this.messages.selection, {
      label: option.label,
    });
    this.updateClearButton();
    this.close();
    this.onCommit();
  }

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
    revealSearchSelectOption(activeOptionElement);
  }

  private updateClearButton(): void {
    this.clearButtonElement.hidden =
      !this.shouldAllowClear || this.getValue() === undefined;
  }

  private isRemote(): boolean {
    return this.loadOptions !== undefined && this.resolveOption !== undefined;
  }

  private findOption(
    options: readonly SelectOption<TValue>[],
    value: TValue,
  ): SelectOption<TValue> | undefined {
    return options.find((option) => Object.is(option.value, value));
  }

  private findKnownOption(value: TValue): SelectOption<TValue> | undefined {
    if (Object.is(this.selectedResolvedOption?.value, value)) {
      return this.selectedResolvedOption;
    }
    return (
      this.findOption(this.seedOptions, value) ??
      this.findOption(this.currentRemoteOptions, value) ??
      this.tokenMap.optionForToken(this.tokenMap.tokenForValue(value) ?? '')
    );
  }

  private assertRemoteOptions(
    options: readonly SelectOption<TValue>[],
  ): readonly SelectOption<TValue>[] {
    assertSupportedOptionCount(options.length);
    for (const option of options) {
      if (
        (typeof option.value !== 'string' && typeof option.value !== 'number') ||
        typeof option.label !== 'string'
      ) {
        throw new EditorConfigurationError(
          'Remote SearchSelect returned an invalid option.',
        );
      }
    }
    // Construction also rejects duplicate typed values.
    new ChoiceOptionStore(options);
    return options;
  }

  private setCurrentOptions(options: readonly SelectOption<TValue>[]): void {
    this.currentRemoteOptions = [...options];
    this.tokenMap = new ChoiceOptionStore(options);
    const currentTokens = new Set(this.tokenMap.entries().map(([token]) => token));
    for (const token of this.optionElementCacheByToken.keys()) {
      if (!currentTokens.has(token)) {
        this.optionElementCacheByToken.delete(token);
      }
    }
    this.selectedToken =
      this.selectedValue === undefined
        ? undefined
        : this.tokenMap.tokenForValue(this.selectedValue);
    if (this.selectedValue !== undefined) {
      const selectedOption = this.findOption(options, this.selectedValue);
      if (selectedOption !== undefined) {
        this.cancelResolveRequest();
        this.selectedResolvedOption = selectedOption;
        this.inputElement.value = selectedOption.label;
      }
    }
  }

  private cancelSearchRequest(): void {
    this.searchRevision += 1;
    this.searchAbortController?.abort();
    this.searchAbortController = undefined;
    this.isLoading = false;
    this.updateBusyState();
  }

  private startRemoteSearch(query: string): void {
    const loader = this.loadOptions;
    if (loader === undefined || this.isDestroyed || !this.isOpen) {
      return;
    }
    this.cancelSearchRequest();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < this.searchThreshold) {
      this.renderRemoteFeedback(
        'threshold',
        formatAnnouncement(this.messages.searchTooShort, {
          count: String(this.searchThreshold),
        }),
      );
      return;
    }

    const abortController = new AbortController();
    this.searchAbortController = abortController;
    const revision = this.searchRevision;
    this.isLoading = true;
    this.updateBusyState();
    this.renderRemoteFeedback('loading', this.messages.loading);
    let loadResult: ReturnType<SearchSelectOptionLoader<TValue>>;
    try {
      loadResult = loader(query, { signal: abortController.signal });
    } catch {
      this.searchAbortController = undefined;
      this.isLoading = false;
      this.updateBusyState();
      this.element.classList.add('alteditor-lite-search-select--error');
      this.renderRemoteFeedback('error', this.messages.loadError);
      return;
    }
    void Promise.resolve(loadResult).then(
      (options) => {
        if (
          this.isDestroyed ||
          abortController.signal.aborted ||
          revision !== this.searchRevision ||
          !this.isOpen
        ) {
          return;
        }
        this.searchAbortController = undefined;
        this.isLoading = false;
        this.updateBusyState();
        try {
          const validatedOptions = this.assertRemoteOptions(options);
          this.setCurrentOptions(validatedOptions);
          this.filteredEntries = this.tokenMap.entries().map(([token, option]) => ({
            option,
            token,
          }));
          this.element.classList.remove('alteditor-lite-search-select--error');
          this.renderOptionElements();
        } catch {
          this.element.classList.add('alteditor-lite-search-select--error');
          this.renderRemoteFeedback('error', this.messages.loadError);
        }
      },
      () => {
        if (
          this.isDestroyed ||
          abortController.signal.aborted ||
          revision !== this.searchRevision ||
          !this.isOpen
        ) {
          return;
        }
        this.searchAbortController = undefined;
        this.isLoading = false;
        this.updateBusyState();
        this.element.classList.add('alteditor-lite-search-select--error');
        this.renderRemoteFeedback('error', this.messages.loadError);
      },
    );
  }

  private renderRemoteFeedback(
    state: 'loading' | 'error' | 'threshold',
    message: string,
  ): void {
    this.filteredEntries = [];
    this.enabledOptionIndices = [];
    this.optionElementByToken.clear();
    const feedback = document.createElement('div');
    feedback.className = `alteditor-lite-search-select__feedback alteditor-lite-search-select__feedback--${state}`;
    feedback.textContent = message;
    this.listboxElement.replaceChildren(feedback);
    this.resultStatusElement.textContent = message;
    this.setActiveToken(undefined);
  }

  private cancelResolveRequest(): void {
    this.resolveRevision += 1;
    this.resolveAbortController?.abort();
    this.resolveAbortController = undefined;
    this.isResolving = false;
    this.updateBusyState();
  }

  private startResolve(value: TValue): void {
    const resolver = this.resolveOption;
    if (resolver === undefined || this.isDestroyed) {
      return;
    }
    this.cancelResolveRequest();
    const abortController = new AbortController();
    this.resolveAbortController = abortController;
    const revision = this.resolveRevision;
    this.isResolving = true;
    this.updateBusyState();
    this.resultStatusElement.textContent = this.messages.loading;
    let resolveResult: ReturnType<SearchSelectOptionResolver<TValue>>;
    try {
      resolveResult = resolver(value, { signal: abortController.signal });
    } catch {
      this.resolveAbortController = undefined;
      this.isResolving = false;
      this.updateBusyState();
      this.showResolveError();
      return;
    }
    void Promise.resolve(resolveResult).then(
      (option) => {
        if (
          this.isDestroyed ||
          abortController.signal.aborted ||
          revision !== this.resolveRevision ||
          !Object.is(this.selectedValue, value)
        ) {
          return;
        }
        this.resolveAbortController = undefined;
        this.isResolving = false;
        this.updateBusyState();
        if (option === undefined) {
          return;
        }
        try {
          this.assertRemoteOptions([option]);
        } catch {
          this.showResolveError();
          return;
        }
        if (!Object.is(option.value, value)) {
          this.showResolveError();
          return;
        }
        this.selectedResolvedOption = option;
        this.selectedToken = this.tokenMap.tokenForValue(value);
        this.inputElement.value = option.label;
        this.element.classList.remove('alteditor-lite-search-select--error');
        this.resultStatusElement.textContent = formatAnnouncement(
          this.messages.selection,
          { label: option.label },
        );
        this.updateClearButton();
      },
      () => {
        if (
          this.isDestroyed ||
          abortController.signal.aborted ||
          revision !== this.resolveRevision ||
          !Object.is(this.selectedValue, value)
        ) {
          return;
        }
        this.resolveAbortController = undefined;
        this.isResolving = false;
        this.updateBusyState();
        this.showResolveError();
      },
    );
  }

  private showResolveError(): void {
    this.element.classList.add('alteditor-lite-search-select--error');
    this.resultStatusElement.textContent = this.messages.loadError;
    if (this.isOpen) {
      this.renderRemoteFeedback('error', this.messages.loadError);
    }
  }

  private updateBusyState(): void {
    this.element.setAttribute('aria-busy', String(this.isLoading || this.isResolving));
  }
}
