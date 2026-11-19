# Issue #981 — Fix `pnpm test:coverage`: `@vitest/coverage-v8` not installed

**GitHub:** https://github.com/StellarLock/StellarLock/issues/981  
**Status:** Resolved in PR #1006  
**Area:** `package.json`, `pnpm-lock.yaml`

---

## Problem

`vitest.config.ts` configures the V8 coverage provider:

```ts
coverage: {
  provider: "v8",
  ...
}
```

Running `pnpm test:coverage` failed immediately with:

```
Error: Could not find coverage provider "v8".
Make sure "@vitest/coverage-v8" is installed.
```

The `@vitest/coverage-v8` package was listed as a peer dependency of `vitest` but was
never added to `devDependencies` in `package.json`. The lockfile therefore contained no
entry for it, causing the error in both local development and CI.

---

## Resolution

`@vitest/coverage-v8` was added to `devDependencies` at the same minor version as
`vitest` (`^3.2.6`):

```json
"devDependencies": {
  "@vitest/coverage-v8": "^3.2.6",
  ...
}
```

The `pnpm-lock.yaml` was regenerated. After the fix:

- `pnpm test:coverage` runs successfully and prints a coverage table.
- `pnpm install --frozen-lockfile` passes in CI.

---

## Verifying the fix locally

```bash
pnpm install
pnpm test:coverage
```

The output should end with a coverage summary table, for example:

```
 % Coverage report from v8
 File                        | % Stmts | % Branch | % Funcs | % Lines |
 ...
```

---

## Notes

- `@vitest/ui` was already present in `devDependencies`; this change brings
  `@vitest/coverage-v8` in line with it.
- The `coverage.provider` value `"v8"` is the correct choice for projects using
  Vite + Vitest without instrumentation-based transpilation. No config change was needed,
  only the missing package installation.
