// vitest-axe@0.1.0 only ships type augmentation for the pre-v1 `Vi.Assertion`
// global namespace. Vitest 3's `expect()` types come from `declare module
// 'vitest' { interface Assertion<T> }` instead (see @testing-library/jest-dom
// for the same pattern), so the matcher registered at runtime via
// `expect.extend(axeMatchers)` in src/test/setup.ts isn't visible to
// TypeScript without this augmentation.
import "vitest"

declare module "vitest" {
  interface Assertion<T = unknown> {
    toHaveNoViolations(): T
  }
}
