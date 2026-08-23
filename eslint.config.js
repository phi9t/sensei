import js from '@eslint/js';
import pluginReactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      'no-restricted-globals': [
        'error',
        {
          name: 'process',
          message: 'process is a Node global and is unavailable in browser code',
        },
        {
          name: 'Buffer',
          message: 'Buffer is a Node global and is unavailable in browser code',
        },
        {
          name: '__dirname',
          message: '__dirname is a Node global and is unavailable in browser code',
        },
        {
          name: '__filename',
          message: '__filename is a Node global and is unavailable in browser code',
        },
        {
          name: 'require',
          message: 'require is a Node global and is unavailable in browser code',
        },
        {
          name: 'module',
          message: 'module is a Node global and is unavailable in browser code',
        },
      ],
    },
  },
  {
    files: ['vite.config.ts', 'scripts/**/*.{js,mjs,ts}', 'tests/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  {
    ignores: ['dist', 'node_modules', 'package-lock.json', '.worktrees/**', 'worktrees/**'],
  },
];
