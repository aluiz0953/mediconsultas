// Quality gates (file-size budget, no direct console). apps/web already lints
// with oxlint; this config adds only what oxlint has no rule for, plus a
// small budget for complexity. Rule sources live in ./eslint-rules.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

export default defineConfig([
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["apps/*/src/**/*.{js,jsx,ts,tsx,mjs,cjs}"],
    plugins: { quality },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",
      "prefer-const": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],
      "quality/max-lines": ["error", { max: 350 }],
      // Baseline 4 (api/index.ts x2, mailer + verification stubs). Back to
      // "error" when there is a logger and the count is 0.
      "quality/no-direct-console": [
        "warn",
        { logger: "a logger module (none exists yet)" },
      ],
      // tseslint "strict" rules with pre-existing violations: baseline 93 / 1.
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-namespace": "warn",
    },
  },
  {
    // The existing eslint-disable comments already target this rule.
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Same budget for tests, at "warn". After the "error" block on purpose.
    files: [
      "**/*.test.{ts,tsx}",
      "**/{__tests__,__mocks__,fixtures,mocks}/**/*.{ts,tsx}",
    ],
    plugins: { quality },
    rules: {
      "quality/max-lines": ["warn", { max: 350, includeTests: true }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: {
      "max-statements": "off",
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    ".claude/**",
    ".github/**",
    "node_modules/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/dist-android/**",
    "apps/web/android/**",
    "apps/api/migrations/**",
    "e2e/**",
    "load-test/**",
    "coverage/**",
    "**/*.tsbuildinfo",
    "package-lock.json",
    "verify.mjs",
  ]),
]);
