import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import prettierConfig from "eslint-config-prettier"

export default tseslint.config(
  // e2e/ and playwright.config.ts depend on @playwright/test, which isn't in
  // the lockfile yet (separate pre-existing gap - tracked outside this lint
  // cleanup); public/sw.js is a standalone service worker script with no
  // benefit from type-aware linting.
  { ignores: ["dist", "contracts", "e2e", "playwright.config.ts", "public/sw.js"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "vite.config.ts",
            "vitest.config.ts",
            "commitlint.config.js",
            ".storybook/*.ts",
            ".storybook/*.tsx",
            "api/*.ts",
            "api/_lib/*.ts",
            "api/notifications/*.ts",
            "indexer/*.ts",
          ],
          // The globs above intentionally span more than the typescript-eslint
          // default cap of 8 files sharing the synthetic "default project".
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 20,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  // ── #1062: Ban 1e7 literal for token-amount math ──────────────────────────
  // The only legitimate use of 1e7 is XLM fee conversion, which must go
  // through the named `XLM_STROOPS_PER_UNIT` constant in src/lib/stellar.ts.
  // Any new occurrence in src/ is a bug waiting to happen on non-7-decimal tokens.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Matches numeric literals equal to 1e7 (10000000) used in
          // multiplicative or divisive expressions — the typical amount-encoding pattern.
          selector:
            "BinaryExpression[operator=/[*\\/]/] Literal[value=10000000]",
          message:
            "Do not use 1e7 / 10000000 for token amount math. " +
            "Use parseUnits(str, decimals) from @/lib/utils instead. " +
            "XLM fee conversions must use XLM_STROOPS_PER_UNIT from @/lib/stellar.",
        },
      ],
    },
  },
  prettierConfig,
)
