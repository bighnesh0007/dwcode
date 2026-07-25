import tseslint from "typescript-eslint";

/**
 * Backend lint config.
 *
 * Mirrors the client's strictness (typescript-eslint strictTypeChecked +
 * stylisticTypeChecked) so both halves of the monorepo hold the same bar, plus two
 * rules that encode this codebase's architectural constraints:
 *
 *  1. `process.env` may only be read inside src/config/ — everything else must import
 *     the typed, validated `config` object.
 *  2. Services must not import express, so business logic stays HTTP-agnostic and
 *     unit-testable without supertest.
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },

  // Type-aware rules need a tsconfig, so they are scoped to TypeScript sources only.
  // Applying them to this .mjs config file would fail to load (no type information).
  // Same pattern as client/eslint.config.mjs.
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),

  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Matches the client's pragmatic exceptions: request/response JSON is `any`
      // until it passes through zod, and the schemas are the real guard.
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

      // Generic helpers here intentionally take a caller-supplied type that appears
      // once in the signature — `store.get<T>(key)`, `ok<T>(res, data)`,
      // `validatedBody<T>(req)`. The parameter is how the caller states the expected
      // shape; rewriting them to `unknown` would push casts to every call site.
      "@typescript-eslint/no-unnecessary-type-parameters": "off",

      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-implicit-coercion": "error",
      // All output goes through the pino logger, so console.* is a mistake.
      "no-console": "error",

      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Read configuration from src/config instead of process.env.",
        },
      ],
    },
  },

  // src/config/ is the one place allowed to touch process.env.
  {
    files: ["src/config/**/*.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  // Services own business logic and must stay free of HTTP types.
  {
    files: ["src/services/**/*.ts", "src/repositories/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "express",
              message:
                "Services and repositories must not depend on express — keep HTTP concerns in controllers/middleware.",
            },
          ],
        },
      ],
    },
  },

  // Tests: console output and non-null assertions are fine.
  {
    files: ["tests/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
