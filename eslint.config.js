import js from '@eslint/js';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // dist/ holds generated bundles; packages/action/action/ is a byte-identical
    // copy of packages/action/ kept for the published action layout — linting it
    // twice only produces duplicate findings.
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'packages/action/action/**',
      'providers/**',
    ],
  },
  {
    files: ['**/*.js'],
    plugins: { security },
    rules: {
      ...security.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // core touches credentials directly — no exceptions, no eslint-disable.
    files: ['packages/core/**/*.js'],
    rules: {
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-child-process': 'error',
      'security/detect-non-literal-require': 'error',
    },
  },
  {
    // The web app's entry point runs in a browser: document/window exist,
    // process/require do not. build.js next to it is still a Node script.
    files: ['packages/web/src/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // The VS Code extension is CommonJS (the extension host requires it).
    files: ['packages/vscode/src/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
];
