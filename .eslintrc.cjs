/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// eslint-disable-next-line strict
'use strict';

module.exports = {
  // Include actions, but not built file in dist/.
  ignorePatterns: ['!.github', '**/dist/'],
  // start with google standard style
  //     https://github.com/google/eslint-config-google/blob/master/index.js
  extends: [
    'eslint:recommended',
    'google',
    // 'plugin:@typescript-eslint/recommended',
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  plugins: [
    '@typescript-eslint',
  ],
  env: {
    node: true,
    es6: true,
  },
  // Use the typescript parser for stage 3 syntax and type support.
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    extraFileExtensions: ['.cjs'],
    ecmaFeatures: {
      globalReturn: true,
      jsx: false,
    },
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.eslint.json'],
    warnOnUnsupportedTypeScriptVersion: false,
  },

  rules: {
    // 2 == error, 1 == warning, 0 == off
    'eqeqeq': 2,
    'indent': [2, 2, {
      SwitchCase: 1,
      VariableDeclarator: 2,
      CallExpression: {arguments: 'off'},
      MemberExpression: 'off',
      FunctionExpression: {body: 1, parameters: 2},
      FunctionDeclaration: {body: 1, parameters: 2},
      ignoredNodes: [
        'ConditionalExpression > :matches(.consequent, .alternate)',
        'VariableDeclarator > ArrowFunctionExpression > :expression.body',
        'CallExpression > ArrowFunctionExpression > :expression.body',
      ],
    }],
    'no-floating-decimal': 2,
    'max-len': [2, 100, {
      ignoreComments: true,
      ignoreUrls: true,
      tabWidth: 2,
    }],
    'no-empty': [2, {
      allowEmptyCatch: true,
    }],
    'no-implicit-coercion': [2, {
      boolean: false,
      number: true,
      string: true,
    }],
    'no-unused-expressions': [2, {
      allowShortCircuit: true,
      allowTernary: false,
    }],
    'no-unused-vars': [2, {
      vars: 'all',
      args: 'after-used',
      argsIgnorePattern: '(^reject$|^_$)',
      varsIgnorePattern: '(^_$)',
    }],
    'space-infix-ops': 2,
    'strict': [2, 'global'],
    'prefer-const': 2,
    'curly': [2, 'multi-line'],
    'comma-dangle': [2, {
      arrays: 'always-multiline',
      objects: 'always-multiline',
      imports: 'always-multiline',
      exports: 'always-multiline',
      functions: 'never',
    }],
    'operator-linebreak': [2, 'after'],
    'arrow-parens': [2, 'as-needed'],

    // From @typescript-eslint/recommended-requiring-type-checking, but without
    // disabling eslint-recommended rules.
    '@typescript-eslint/await-thenable': 2,
    '@typescript-eslint/no-floating-promises': 2,
    '@typescript-eslint/no-for-in-array': 2,
    '@typescript-eslint/no-implied-eval': 2,
    '@typescript-eslint/no-misused-promises': 2,
    // '@typescript-eslint/no-unsafe-assignment': 2,
    '@typescript-eslint/no-unsafe-call': 2,
    // '@typescript-eslint/no-unsafe-member-access': 2,
    // '@typescript-eslint/no-unsafe-return': 2,
    '@typescript-eslint/prefer-regexp-exec': 2,
    'require-await': 'off',
    '@typescript-eslint/require-await': 2,
    // '@typescript-eslint/restrict-plus-operands': 2,
    // '@typescript-eslint/restrict-template-expressions': 2,
    '@typescript-eslint/unbound-method': 2,

    // Could be good for jsdoc, but unclear if it's doing anything.
    '@typescript-eslint/no-unnecessary-type-assertion': 2,
    '@typescript-eslint/no-inferrable-types': 2, // Could be nice for jsdoc tpes.

    // Definitely isn't using jsdoc.
    // '@typescript-eslint/explicit-module-boundary-types': 1,

    // These are mostly @typescript-eslint/recommended, but without disabling
    // eslint-recommended rules.
    // see https://github.com/typescript-eslint/typescript-eslint/blob/e01204931e460f5e6731abc443c88d666ca0b07a/packages/eslint-plugin/src/configs/recommended.ts
    '@typescript-eslint/adjacent-overload-signatures': 2,
    '@typescript-eslint/ban-ts-comment': 2,
    '@typescript-eslint/ban-types': 2,
    'no-array-constructor': 0, // Not needed?
    '@typescript-eslint/no-array-constructor': 2,
    'no-empty-function': 0, // Not needed?
    '@typescript-eslint/no-empty-function': 2,
    '@typescript-eslint/no-empty-interface': 2,
    '@typescript-eslint/no-explicit-any': 1,
    '@typescript-eslint/no-extra-non-null-assertion': 2,
    // 'no-extra-semi': 0,
    // '@typescript-eslint/no-extra-semi': 2, // Not needed? seems ok even with class properties
    '@typescript-eslint/no-misused-new': 2,
    '@typescript-eslint/no-namespace': 2,
    '@typescript-eslint/no-non-null-asserted-optional-chain': 2,
    '@typescript-eslint/no-non-null-assertion': 2,
    '@typescript-eslint/no-this-alias': 2,
    // 'no-unused-vars': 0,
    // '@typescript-eslint/no-unused-vars': 2, // Seems unnecessary?
    '@typescript-eslint/no-var-requires': 2,
    '@typescript-eslint/prefer-as-const': 2,
    '@typescript-eslint/prefer-namespace-keyword': 2,
    '@typescript-eslint/triple-slash-reference': 2,

    // Disabled rules
    'require-jsdoc': 0,
    'valid-jsdoc': 0,

    'no-console': [2, {
      // we allow stderr (console.warn and console.error).
      // stdout (console.log) will have to be explicitly opted into.
      allow: ['warn', 'error'],
    }],
  },
};
