module.exports = {
  env: {
    es2021: true,
    node: true,
  },
  extends: ['standard-with-typescript', 'prettier'],
  ignorePatterns: ['node_modules', 'dist', 'examples'],
  overrides: [],
  parserOptions: {
    project: ['tsconfig.json'],
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/strict-boolean-expressions': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    'no-fallthrough': 'off',
  },
};
