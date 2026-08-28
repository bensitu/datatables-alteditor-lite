export { AltEditorLite } from './core/alt-editor-lite.js';
export {
  ENGLISH_LANGUAGE,
  resolveLanguage,
  type AltEditorLiteLanguage,
  type EditorLanguageDefinition,
  type PartialEditorLanguage,
} from './core/alt-editor-lite-language.js';
export {
  loadEditorLanguage,
  type EditorLanguageLoadOptions,
} from './localization/editor-language-resource.js';
export {
  getLocale,
  getRegisteredLocaleNames,
  registerLocale,
} from './localization/locale-registry.js';
export {
  AltEditorLiteError,
  EditorAlreadyInitializedError,
  EditorConfigurationError,
  EditorDestroyedError,
  EditorFileLimitError,
  EditorLanguageLoadError,
  EditorOperationBusyError,
  EditorSelectionCountError,
  EditorSelectionUnavailableError,
  EditorTargetUnavailableError,
  type AltEditorLiteErrorOptions,
} from './core/alt-editor-lite-error.js';
export type {
  BatchEditOperationContext,
  AfterSuccessContext,
  AltEditorLiteOptions,
  BeforeOpenContext,
  BeforeSubmitContext,
  ClientSideOperations,
  EditorErrorHookContext,
  EditorHooks,
  EditorOperations,
  OperationContext,
  CreateOperationContext,
  EditOperationContext,
  RefreshOperationContext,
  RemoveOperationContext,
} from './core/alt-editor-lite-options.js';
export type {
  BatchFieldBaseline,
  BatchFieldCurrentState,
  BatchFieldState,
} from './core/batch-field-state.js';
export type {
  DialogEditingOptions,
  DialogTemplateSource,
  EditingOptions,
  InlineActivation,
  InlineEditingOptions,
} from './core/editing-options.js';
export type {
  EditorCreateSubmitEventDetail,
  EditorCreateSuccessEventDetail,
  EditorBatchEditSubmitEventDetail,
  EditorBatchEditSuccessEventDetail,
  EditorCloseEventDetail,
  EditorCloseReason,
  EditorDestroyEventDetail,
  EditorEditSubmitEventDetail,
  EditorEditSuccessEventDetail,
  EditorErrorEventDetail,
  EditorEventDetailMap,
  EditorEventName,
  EditorOpenEventDetail,
  EditorRefreshSuccessEventDetail,
  EditorRemoveSubmitEventDetail,
  EditorRemoveSuccessEventDetail,
  EditorRefreshEventDetail,
  EditorSubmitEventDetail,
  EditorSuccessEventDetail,
} from './core/editor-event.js';
export type {
  DialogAction,
  EditorOperation,
  EditorOperationMode,
  EditorOperationTarget,
} from './core/editor-operation.js';
export type { EditorState } from './core/editor-state.js';
export type {
  BatchChanges,
  BuiltinValue,
  DeepPartial,
  EditorValues,
} from './core/editor-values.js';
export type {
  BaseFieldConfig,
  BaseSearchSelectFieldConfig,
  CheckboxFieldConfig,
  DateFieldConfig,
  DateTimeFieldConfig,
  EmailFieldConfig,
  FieldChangeCallback,
  FieldChangeContext,
  FieldConfig,
  FieldValidationContext,
  FieldValidator,
  FileEncoding,
  FileFieldConfig,
  HiddenFieldConfig,
  LocalSearchSelectFieldConfig,
  MultipleFileFieldConfig,
  NumberFieldConfig,
  PasswordFieldConfig,
  RadioFieldConfig,
  RemoteSearchSelectSource,
  RemoteSearchSelectFieldConfig,
  SearchSelectFieldConfig,
  SearchSelectSearchOptions,
  SelectFieldConfig,
  SelectOption,
  SingleFileFieldConfig,
  TextareaFieldConfig,
  TextFieldConfig,
  TimeFieldConfig,
  VisibleFieldConfig,
} from './fields/field-config.js';
export {
  defineCustomField,
  type CustomFieldAdapter,
  type CustomFieldCapabilities,
  type CustomFieldConfig,
  type CustomFieldConfigOptions,
  type CustomFieldControllerContext,
  type CustomFieldDefinition,
  type CustomFieldDefinitionOptions,
  type FieldValueComparator,
} from './fields/custom-field.js';
export type {
  SearchSelectLoadContext,
  SearchSelectOptionLoader,
  SearchSelectOptionResolver,
} from './fields/search-select-data-source.js';
export type {
  ChoiceFieldController,
  FieldController,
  FieldValidationResult,
} from './fields/field-controller.js';
export { isChoiceFieldController } from './fields/field-controller.js';
export type { FieldValue, MaybePromise } from './fields/field-value.js';
export type { FormController } from './form/form-controller.js';
export {
  defineFormDependencies,
  type ChoicePatchOptions,
  type FieldStatePatchFor,
  type FormDependencies,
  type FormDependencyContext,
  type FormDependencyResolver,
  type FormDependencyResult,
} from './form/form-dependency.js';
export type {
  FormFieldErrors,
  FormValidationContext,
  FormValidationResult,
  FormValidator,
} from './form/form-validation.js';
export type { FieldPath, FieldPathValue } from './object-path/field-path.js';
export type { InlineKeyboardShortcut } from './inline/inline-keyboard-shortcut.js';
export type {
  EditorHost,
  HostApplyContext,
  HostBatchUpdate,
  HostBatchUpdateCapability,
  HostPresentationCapability,
  HostRecordEntry,
  HostReadContext,
  HostRefreshCapability,
  HostRowCollectionCapability,
  HostSelectionCapability,
} from './host/editor-host.js';
export type { HostInlineState as InlineEditState } from './host/inline-host-runtime.js';
