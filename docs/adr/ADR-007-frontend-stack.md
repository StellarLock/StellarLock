# ADR-007: React + Vite + Tailwind Stack

## Status
Accepted

## Context
StellarLock needs a modern, fast, and type-safe frontend. The stack must support
i18n, PWA capabilities, Storybook component development, and Vitest unit tests.

## Decision
Use React 19 with Vite 8 as the build tool, Tailwind CSS 4 for styling,
React Router 7 for navigation, and `react-i18next` for internationalization.

## Consequences
- `vite.config.ts` aliases `@` to `src/` and splits vendor chunks for React and
  Stellar SDK
- Tailwind 4 is configured via `@theme` in `src/index.css` with a custom
  color system (`oklch` tokens)
- Storybook is used for isolated UI component development
- Vitest + Testing Library cover component, hook, and utility tests
- PWA update prompt is handled in-app via `PwaUpdatePrompt` component
