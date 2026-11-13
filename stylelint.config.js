export default {
  extends: ['stylelint-config-standard-scss'],
  ignoreFiles: ['node_modules/**', 'dist/**', '.tmp/**', 'coverage/**'],
  rules: {
    'selector-class-pattern':
      '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$',
  },
}
