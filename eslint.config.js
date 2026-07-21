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
            "lib/*.ts",
            ".storybook/*.ts",
            ".storybook/*.tsx",
            "api/*.ts",
            "indexer/*.ts",
          ],
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
  prettierConfig,
)
