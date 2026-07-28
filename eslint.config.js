import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Build artifacts, deps, and generated code are not linted.
    ignores: [
      'dist',
      'build',
      'node_modules',
      'coverage',
      'convex/_generated',
      'playwright-report',
      'test-results',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  // Browser-side application code (React + TS).
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler-powered rules newly added to react-hooks v7's recommended
      // config (v7 is required by the eslint 10 upgrade). They flag ~99 pre-existing
      // spots, so they run as warnings to hold the CI lint gate at its prior
      // strictness. Real signal worth promoting back to 'error', but the fixes change
      // runtime behavior and belong in their own pass, not a dependency bump.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Surfaced as warnings so the first lint run is signal, not a wall of errors.
      // These are the prime cleanup targets from the code-quality review.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Node-side code: serverless API handlers, Convex functions, build scripts.
  {
    files: ['api/**/*.{ts,js}', 'convex/**/*.{ts,js}', 'scripts/**/*.{ts,js,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  // Disables stylistic rules that would conflict with Prettier formatting.
  prettier
);
