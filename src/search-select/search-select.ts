import { EditorConfigurationError } from '../core/alt-editor-lite-error.js';
import { ChoiceOptionStore } from '../fields/choice-option-store.js';
import { SEARCH_SELECT_MAX_OPTION_COUNT } from '../fields/search-select-constants.js';

import { filterSearchOptions } from './filter-search-options.js';
import {
  initializeSearchSelectAria,
  updateSearchSelectAria,
} from './search-select-aria.js';
import {
  isComposingEnter,
  type SearchSelectNavigationKey,
} from './search-select-keyboard.js';
import { SearchSelectListbox } from './search-select-listbox.js';
import {
  formatAnnouncement,
  type SearchSelectMessages,
} from './search-select-messages.js';
import { SearchSelectRemoteDataController } from './search-select-remote-data-controller.js';

import type { SelectOption } from '../contracts/field-config.js';
import type {
  SearchSelectOptionLoader,
  SearchSelectOptionResolver,
} from '../contracts/search-select-data-source.js';
export type { SearchSelectMessages } from './search-select-messages.js';

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

  private debounceTimerId: ReturnType<typeof globalThis.setTimeout> | undefined;

  private isComposing = false;

  private compositionStartValue = '';

  private isDestroyed = false;

  private readOnlyState = false;

  private isLoading = false;

  private isResolving = false;

  private manualValue: string | undefined;

  private searchOrigin: { readonly value: TValue | string | undefined } | undefined;

  private readonly clearButtonElement: HTMLButtonElement;

  private readonly messages: Readonly<SearchSelectMessages>;

  private readonly onCommit: () => void;

  readonly #remoteDataController: SearchSelectRemoteDataController<TValue> | undefined;

  private readonly resultStatusElement: HTMLDivElement;

  private readonly resolveErrorElement: HTMLDivElement;

  private readonly shouldAllowClear: boolean;

  private readonly shouldAllowManualValue: boolean;

  private readonly shouldSortOptions: boolean;

  private readonly isSearchEnabled: boolean;

  private readonly locale: string;

  private readonly searchThreshold: number;

  private readonly debounceMs: number;

  private readonly listenerController = new AbortController();

  private readonly unsubscribeDocumentPointerDown: () => void;

  private selectedToken: string | undefined;

  private selectedValue: TValue | undefined;

  private selectedResolvedOption: SelectOption<TValue> | undefined;

  private seedOptions: readonly SelectOption<TValue>[];

  private currentRemoteOptions: readonly SelectOption<TValue>[] = [];

  private tokenMap: ChoiceOptionStore<TValue>;

  private readonly listbox: SearchSelectListbox<TValue>;

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
    this.#remoteDataController =
      configuration.loadOptions === undefined || configuration.resolveOption === undefined
        ? undefined
        : new SearchSelectRemoteDataController(
            configuration.loadOptions,
            configuration.resolveOption,
          );
    this.instructionsId = `${configuration.fieldId}-instructions`;

    this.element = document.createElement('div');
    this.element.className = 'alteditor-lite-search-select';

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
    this.listboxElement.id = `${configuration.fieldId}-listbox`;
    this.listboxElement.hidden = true;
    this.listboxElement.setAttribute('aria-busy', 'false');

    const instructionsElement = document.createElement('div');
    instructionsElement.className = 'alteditor-lite-visually-hidden';
    instructionsElement.id = this.instructionsId;
    instructionsElement.textContent = this.messages.instructions;

    this.resolveErrorElement = document.createElement('div');
    this.resolveErrorElement.className = 'alteditor-lite-field__error';
    this.resolveErrorElement.textContent = this.messages.loadError;
    this.resolveErrorElement.hidden = true;

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
      this.resolveErrorElement,
    );

    this.listbox = new SearchSelectListbox(
      this.inputElement,
      this.listboxElement,
      this.resultStatusElement,
      this.messages,
    );

    const listeners = { signal: this.listenerController.signal };
    this.inputElement.addEventListener('focus', this.handleFocus, listeners);
    this.element.addEventListener('focusout', this.handleFocusOut, listeners);
    this.inputElement.addEventListener('input', this.handleInput, listeners);
    this.inputElement.addEventListener('keydown', this.handleKeyDown, listeners);
    this.inputElement.addEventListener(
      'compositionstart',
      this.handleCompositionStart,
      listeners,
    );
    this.inputElement.addEventListener(
      'compositionend',
      this.handleCompositionEnd,
      listeners,
    );
    this.clearButtonElement.addEventListener(
      'mousedown',
      this.handleClearMouseDown,
      listeners,
    );
    this.clearButtonElement.addEventListener('click', this.handleClearClick, listeners);
    this.listboxElement.addEventListener(
      'mousedown',
      this.handleOptionMouseDown,
      listeners,
    );
    this.unsubscribeDocumentPointerDown = subscribeToDocumentPointerDown(
      this.handleDocumentPointerDown,
    );
  }

  /** Reads the exact selected option value or current manual string. */
  public getValue(): TValue | string | undefined {
    const committedValue = this.getCommittedValue();
    if (
      committedValue !== undefined ||
      !this.shouldAllowManualValue ||
      this.isComposing
    ) {
      return committedValue;
    }

    return this.inputElement.value.trim().length === 0
      ? undefined
      : this.inputElement.value;
  }

  /** Returns the current immutable local or seed option snapshot. */
  public getOptions(): readonly SelectOption<TValue>[] {
    return this.seedOptions;
  }

  /** Writes an exact option value, manual string, or clear state. */
  public setValue(value: unknown): void {
    this.searchOrigin = undefined;
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
      if (this.listbox.isOpen) {
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
      if (this.listbox.isOpen) {
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
    this.searchOrigin = undefined;
    if (
      this.shouldAllowManualValue &&
      options.some(({ value }) => typeof value !== 'string')
    ) {
      throw new EditorConfigurationError(
        'SearchSelect manual values require string-valued options.',
      );
    }
    if (this.isRemote()) {
      const seedOptionStore = this.createRemoteOptionStore(options);
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
        } else if (this.selectedResolvedOption === undefined && !this.isResolving) {
          this.startResolve(selectedValue);
        }
      }
      if (this.listbox.isOpen && this.currentRemoteOptions.length === 0) {
        this.setCurrentOptions(options, seedOptionStore);
        this.renderEntries();
      }
      return;
    }

    const previousSelectedValue = this.selectedValue;
    const nextTokenMap = new ChoiceOptionStore(options);
    this.seedOptions = nextTokenMap.options();
    this.tokenMap = nextTokenMap;
    this.listbox.clearCache();
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

    if (this.listbox.isOpen) {
      this.renderOptions(
        this.getCommittedValue() === undefined ? this.inputElement.value : '',
      );
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

    this.close();
    this.isDestroyed = true;
    this.cancelScheduledRender();
    this.#remoteDataController?.destroy();
    this.listenerController.abort();
    this.unsubscribeDocumentPointerDown();
    updateSearchSelectAria(this.inputElement, false, undefined);
    this.inputElement.removeAttribute('aria-autocomplete');
    this.inputElement.removeAttribute('aria-controls');
    this.inputElement.removeAttribute('aria-expanded');
    this.listbox.clearCache();
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
    if (this.inputElement.value !== this.compositionStartValue) {
      this.handleInput();
    }
  };

  private readonly handleCompositionStart = (): void => {
    if (!this.isSearchEnabled) {
      return;
    }
    this.isComposing = true;
    this.compositionStartValue = this.inputElement.value;
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
      !this.isResolving
    ) {
      this.startResolve(this.selectedValue);
    }
    this.open();
  };

  private readonly handleInput = (): void => {
    if (!this.isSearchEnabled) {
      return;
    }
    if (this.isComposing) {
      return;
    }

    const hasCommittedValue = this.getCommittedValue() !== undefined;
    this.searchOrigin ??= { value: this.getCommittedValue() };
    this.cancelResolveRequest();
    this.selectedToken = undefined;
    this.selectedValue = undefined;
    this.selectedResolvedOption = undefined;
    this.manualValue = undefined;
    this.updateClearButton();

    if (hasCommittedValue) {
      this.onCommit();
    }

    this.scheduleRender();
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
      const isListboxOpen = this.listbox.isOpen;
      if (!isListboxOpen) {
        this.open();
      }
      if (isListboxOpen || event.key !== 'ArrowDown') {
        this.listbox.moveActiveOption(event.key);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (!this.listbox.isOpen) {
        this.open();
      } else if (this.listbox.activeToken !== undefined) {
        this.selectToken(this.listbox.activeToken);
      } else {
        this.commitManualValue();
        this.close();
      }
      return;
    }

    if (event.key === 'Escape' && this.listbox.isOpen) {
      event.preventDefault();
      event.stopPropagation();
      const origin = this.searchOrigin;
      this.close();
      if (origin !== undefined) {
        this.setValue(origin.value);
        this.onCommit();
      }
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
    this.searchOrigin = undefined;
    const hasCommittedValue = this.getCommittedValue() !== undefined;
    this.cancelResolveRequest();
    this.selectedToken = undefined;
    this.selectedValue = undefined;
    this.selectedResolvedOption = undefined;
    this.manualValue = undefined;
    this.listbox.activeToken = undefined;
    this.inputElement.value = '';
    this.updateClearButton();
    if (this.listbox.isOpen) {
      this.renderOptions('');
    } else {
      updateSearchSelectAria(this.inputElement, false, undefined);
    }

    if (shouldNotify && hasCommittedValue) {
      this.onCommit();
    }
  }

  private close(): void {
    this.searchOrigin = undefined;
    if (!this.isComposing && this.getCommittedValue() === undefined) {
      this.inputElement.value = '';
    }
    this.cancelSearchRequest();
    this.listbox.close();
  }

  private commitManualValue(): void {
    if (
      this.isComposing ||
      !this.shouldAllowManualValue ||
      this.selectedValue !== undefined
    ) {
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

  private getCommittedValue(): TValue | string | undefined {
    return this.selectedValue ?? this.manualValue;
  }

  private open(): void {
    if (this.inputElement.disabled || this.readOnlyState) {
      return;
    }

    this.listbox.open();
    this.renderOptions(
      this.isSearchEnabled && this.getCommittedValue() === undefined
        ? this.inputElement.value
        : '',
    );
  }

  private renderOptions(query: string): void {
    if (this.isRemote()) {
      this.startRemoteSearch(query);
      return;
    }
    this.renderEntries(query);
  }

  private renderEntries(query?: string): void {
    const entries = this.tokenMap.entries().map(([token, option]) => ({ option, token }));
    this.listbox.render(
      query === undefined
        ? entries
        : filterSearchOptions(
            entries,
            query,
            this.locale,
            this.searchThreshold,
            this.shouldSortOptions,
          ),
      this.selectedToken,
    );
  }

  private scheduleRender(): void {
    this.cancelScheduledRender();
    this.listbox.open();
    this.listbox.position();

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

  private updateClearButton(): void {
    this.clearButtonElement.hidden =
      !this.shouldAllowClear || this.getCommittedValue() === undefined;
  }

  private isRemote(): boolean {
    return this.#remoteDataController !== undefined;
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

  private createRemoteOptionStore(
    options: readonly SelectOption<TValue>[],
  ): ChoiceOptionStore<TValue> {
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
    return new ChoiceOptionStore(options);
  }

  private setCurrentOptions(
    options: readonly SelectOption<TValue>[],
    store: ChoiceOptionStore<TValue>,
  ): void {
    this.currentRemoteOptions = [...options];
    this.tokenMap = store;
    const currentTokens = new Set(this.tokenMap.entries().map(([token]) => token));
    this.listbox.retainOptions(currentTokens);
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
    this.#remoteDataController?.cancel(0);
    this.isLoading = false;
    this.updateBusyState();
  }

  private startRemoteSearch(query: string): void {
    const remoteDataController = this.#remoteDataController;
    if (remoteDataController === undefined || this.isDestroyed || !this.listbox.isOpen) {
      return;
    }
    this.cancelSearchRequest();
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < this.searchThreshold) {
      this.listbox.renderFeedback(
        'threshold',
        formatAnnouncement(this.messages.searchTooShort, {
          count: String(this.searchThreshold),
        }),
      );
      return;
    }

    this.isLoading = true;
    this.updateBusyState();
    this.listbox.renderFeedback('loading', this.messages.loading);
    void remoteDataController.search(query).then((result) => {
      if (this.isDestroyed || !this.listbox.isOpen || result === undefined) {
        return;
      }
      this.isLoading = false;
      this.updateBusyState();
      if (result[0] === 'error') {
        this.element.classList.add('alteditor-lite-search-select--error');
        this.listbox.renderFeedback('error', this.messages.loadError);
        return;
      }
      try {
        const options = result[1];
        this.setCurrentOptions(options, this.createRemoteOptionStore(options));
        this.element.classList.remove('alteditor-lite-search-select--error');
        this.renderEntries();
      } catch {
        this.element.classList.add('alteditor-lite-search-select--error');
        this.listbox.renderFeedback('error', this.messages.loadError);
      }
    });
  }

  private cancelResolveRequest(): void {
    this.#remoteDataController?.cancel(1);
    this.resolveErrorElement.hidden = true;
    this.element.classList.remove('alteditor-lite-search-select--error');
    this.isResolving = false;
    this.updateBusyState();
  }

  private startResolve(value: TValue): void {
    const remoteDataController = this.#remoteDataController;
    if (remoteDataController === undefined || this.isDestroyed) {
      return;
    }
    this.cancelResolveRequest();
    this.isResolving = true;
    this.updateBusyState();
    this.resultStatusElement.textContent = this.messages.loading;
    void remoteDataController.resolve(value).then((result) => {
      if (
        this.isDestroyed ||
        result === undefined ||
        !Object.is(this.selectedValue, value)
      ) {
        return;
      }
      this.isResolving = false;
      this.updateBusyState();
      if (result[0] === 'error') {
        this.showResolveError();
        return;
      }
      const option = result[1];
      if (option === undefined) {
        this.showResolveError();
        return;
      }
      try {
        this.createRemoteOptionStore([option]);
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
      this.resultStatusElement.textContent = formatAnnouncement(this.messages.selection, {
        label: option.label,
      });
      this.updateClearButton();
    });
  }

  private showResolveError(): void {
    this.resolveErrorElement.hidden = false;
    this.element.classList.add('alteditor-lite-search-select--error');
    this.resultStatusElement.textContent = this.messages.loadError;
    if (this.listbox.isOpen) {
      this.listbox.renderFeedback('error', this.messages.loadError);
    }
  }

  private updateBusyState(): void {
    this.listboxElement.setAttribute(
      'aria-busy',
      String(this.isLoading || this.isResolving),
    );
  }
}
