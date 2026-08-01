import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Complete Simplified Chinese locale.
 */
export const zhCn: Readonly<AltEditorLiteLanguage> = {
  locale: 'zh-CN',
  actions: {
    create: '新建',
    edit: '编辑',
    remove: '删除',
    refresh: '刷新',
    submit: '提交',
    cancel: '取消',
    close: '关闭',
  },
  dialog: {
    createTitle: '新建行',
    editTitle: '编辑行',
    removeTitle: '删除行',
    removeMessage: '请确认是否删除所选行。',
  },
  validation: {
    required: '此字段为必填项。',
    invalid: '请输入有效值。',
    unique: '请输入唯一值。',
  },
  searchSelect: {
    placeholder: '请选择',
    searchPlaceholder: '搜索选项',
    noResults: '没有匹配的选项',
    clear: '清除选择',
  },
  accessibility: {
    searchSelectInstructions: '使用方向键浏览选项。',
    searchSelectResults: '有 {count} 个可用选项。',
    searchSelectSelection: '已选择 {label}。',
  },
  errors: {
    generic: '无法完成操作。',
    fileCount: '选择的文件过多。',
    fileSize: '所选文件过大。',
    selectionRequired: '请至少选择一行。',
    singleSelectionRequired: '请仅选择一行。',
    targetUnavailable: '所选行已不可用。',
  },
};

export default zhCn;
