const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const jsxA11y = require('eslint-plugin-jsx-a11y');
const prettier = require('eslint-config-prettier');

// Pinned to ESLint 9: eslint-plugin-react and eslint-plugin-jsx-a11y do not yet
// declare an ESLint 10 peer range. Revisit once both ship v10 support.

// Rules with pre-existing violations are set to 'warn' so this config can land
// without breaking CI. Each group is ratcheted to 'error' by the requirement
// noted against it in specs/codebase-quality-remediation/spec.md.
const PREEXISTING_CORE = {
  'no-async-promise-executor': 'warn',
  'no-case-declarations': 'warn',
  'no-control-regex': 'warn',
  'no-dupe-class-members': 'warn', // R18
  'no-misleading-character-class': 'warn',
  'no-prototype-builtins': 'warn',
  'no-regex-spaces': 'warn',
  'no-useless-escape': 'warn',
};

const PREEXISTING_A11Y = {
  'jsx-a11y/click-events-have-key-events': 'warn', // R5
  'jsx-a11y/interactive-supports-focus': 'warn', // R5
  'jsx-a11y/label-has-associated-control': 'warn', // R5
  'jsx-a11y/no-autofocus': 'warn',
  'jsx-a11y/no-noninteractive-element-interactions': 'warn', // R5
  'jsx-a11y/no-noninteractive-tabindex': 'warn', // R5
  'jsx-a11y/no-static-element-interactions': 'warn', // R5
};

const PREEXISTING_HOOKS = {
  'react-hooks/exhaustive-deps': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/preserve-manual-memoization': 'warn',
  'react-hooks/purity': 'warn',
  'react-hooks/refs': 'warn',
  'react-hooks/rules-of-hooks': 'warn', // R19
  'react-hooks/set-state-in-effect': 'warn',
};

const TEST_FILES = [
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.pbt.test.js',
  '**/*.pbt.test.jsx',
  '**/*.integration.test.js',
  '**/*.integration.test.jsx',
  '**/test/**',
  '**/__tests__/**',
  '**/test-utils/**',
  'backend/jest.setup.js',
  'backend/jest.globalSetup.js',
  'frontend/vitest.setup.js',
];

module.exports = [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'backend/.jest-cache/**',
      'frontend/.vitest-cache/**',
      // Runtime data directories (not source)
      'config/**',
      'preview-data/**',
      'staging-data/**',
      'backend/config/**',
      'backend/backups/**',
      'backend/test-backups/**',
      'backend/uploads/**',
      'backend/reports/**',
      'test-pbt-*/**',
      'archive/**',
      'specs/**',
    ],
  },

  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },

  js.configs.recommended,

  // ---------------------------------------------------------------------------
  // Backend — CommonJS, Node
  // ---------------------------------------------------------------------------
  {
    files: ['backend/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...PREEXISTING_CORE,
      'no-console': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // CLI utilities and the logger implementation legitimately write to stdout.
  {
    files: [
      'scripts/**/*.js',
      'backend/scripts/**/*.js',
      'backend/config/logger.js',
      'backend/jest.setup.js',
      'backend/jest.globalSetup.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },

  // ---------------------------------------------------------------------------
  // Frontend — ESM, React 19, browser
  // ---------------------------------------------------------------------------
  {
    files: ['frontend/**/*.{js,jsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      ...PREEXISTING_CORE,
      ...PREEXISTING_A11Y,
      ...PREEXISTING_HOOKS,

      // React 19 automatic JSX runtime — no React import required.
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      // The codebase does not use PropTypes consistently and has no requirement
      // to; enabling this produces ~915 warnings that drown out real signal.
      'react/prop-types': 'off',

      'react/no-unescaped-entities': 'warn',
      'react/no-array-index-key': 'warn', // R15
      'react/jsx-key': 'warn', // R15
      'no-console': 'warn', // R7
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },

  // The frontend logger is the sanctioned console wrapper.
  {
    files: ['frontend/src/utils/logger.js'],
    rules: {
      'no-console': 'off',
    },
  },

  {
    files: ['frontend/vite.config.js', 'frontend/vitest.config.js', 'frontend/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Tests — relaxed
  // ---------------------------------------------------------------------------
  {
    files: TEST_FILES,
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
        fail: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': 'off',
      'react/display-name': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // Must remain last: disables stylistic rules that conflict with Prettier.
  prettier,
];
