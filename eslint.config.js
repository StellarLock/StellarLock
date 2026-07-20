import eslint from "@eslint/js"
import tseslint from "typescript-eslint"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import prettierConfig from "eslint-config-prettier"

export default tseslint.config(
  { ignores: ["dist", "contracts"] },
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
            "lib/*.ts",
            "utils/export.ts",
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
