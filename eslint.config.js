import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import prettierConfig from "eslint-config-prettier"

export default tseslint.config(
  // public/sw.js is a standalone service worker script with no benefit from
  // type-aware linting.
  { ignores: ["dist", "storybook-static", "playwright-report", "test-results", "contracts", "public/sw.js"] },
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
            "playwright.config.ts",
            "commitlint.config.js",
            ".storybook/*.ts",
            ".storybook/*.tsx",
            "api/*.ts",
            "api/_lib/*.ts",
            "api/notifications/*.ts",
            "indexer/*.ts",
            "e2e/*.ts",
            "e2e/pages/*.ts",
          ],
          // The globs above intentionally span more than the typescript-eslint
          // default cap of 8 files sharing the synthetic "default project"
          // (currently ~45 across api/, indexer/, e2e/ and tool configs).
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 100,
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
      // Direct localStorage access throws in Safari private mode, when site
      // data is blocked, or when the quota is exceeded. Use the safe wrapper
      // in src/lib/safe-storage.ts instead.
      "no-restricted-globals": [
        "error",
        {
          name: "localStorage",
          message: "Use the safe helpers from @/lib/safe-storage instead of accessing localStorage directly.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "localStorage",
          message: "Use the safe helpers from @/lib/safe-storage instead of accessing localStorage directly.",
        },
      ],
    },
  },
  {
    // The helper itself (and tests that intentionally simulate a throwing or
    // missing storage) must be allowed to touch localStorage directly.
    files: ["src/lib/safe-storage.ts", "src/lib/safe-storage.test.ts", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-globals": "off",
      "no-restricted-properties": "off",
    },
  },
  prettierConfig,
)
