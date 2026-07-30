export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'custom-property-pattern': 'dt-alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*',
    'selector-class-pattern':
      'dt-alteditor-lite-[a-z0-9]+(?:-[a-z0-9]+)*(?:__(?:[a-z0-9]+-?)+)?(?:--(?:[a-z0-9]+-?)+)?',
  },
};
