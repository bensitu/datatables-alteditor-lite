export default {
  extends: ['stylelint-config-standard'],
  overrides: [
    {
      files: ['examples/**/*.css'],
      rules: {
        'custom-property-pattern': null,
        'selector-class-pattern': null,
      },
    },
  ],
  rules: {
    'custom-property-pattern': 'dt-alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*',
    'selector-class-pattern':
      '(?:dt-alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+-?)+)?(?:--(?:[a-z0-9]+-?)+)?|alteditor-lite-(?:cell--editing|inline(?:__(?:control|error|status)|--(?:busy|invalid))?))',
  },
};
