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
    'custom-property-pattern': 'alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*',
    'selector-class-pattern':
      'alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?',
  },
};
