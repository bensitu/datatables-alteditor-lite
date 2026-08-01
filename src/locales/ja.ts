import type { AltEditorLiteLanguage } from '../core/alt-editor-lite-language.js';

/**
 * Complete Japanese locale.
 */
export const ja: Readonly<AltEditorLiteLanguage> = {
  locale: 'ja',
  actions: {
    create: '作成',
    edit: '編集',
    remove: '削除',
    refresh: '更新',
    submit: '送信',
    cancel: 'キャンセル',
    close: '閉じる',
  },
  dialog: {
    createTitle: '行を作成',
    editTitle: '行を編集',
    removeTitle: '行を削除',
    removeMessage: '選択した行を削除してもよろしいですか。',
  },
  validation: {
    required: 'この項目は必須です。',
    invalid: '有効な値を入力してください。',
    unique: '重複しない値を入力してください。',
  },
  searchSelect: {
    placeholder: 'オプションを選択',
    searchPlaceholder: 'オプションを検索',
    noResults: '一致するオプションがありません',
    clear: '選択を解除',
  },
  accessibility: {
    searchSelectInstructions: '矢印キーでオプションを移動できます。',
    searchSelectResults: '{count} 件のオプションがあります。',
    searchSelectSelection: '{label} を選択しました。',
  },
  errors: {
    generic: '操作を完了できませんでした。',
    fileCount: '選択したファイルが多すぎます。',
    fileSize: '選択したファイルが大きすぎます。',
    selectionRequired: '少なくとも 1 行を選択してください。',
    singleSelectionRequired: '1 行だけ選択してください。',
    targetUnavailable: '選択した行は利用できなくなりました。',
  },
};

export default ja;
