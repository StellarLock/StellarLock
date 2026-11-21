/**
 * Contract error coverage test (#1069)
 *
 * Frontend error mappings have drifted from the on-chain contracts several
 * times (#801, #802, and most recently six missing entries fixed in #1067 /
 * #1068). This test closes that gap by reading every contract's
 * `ContractError` enum straight out of its Rust source, and asserting that
 * each variant has both:
 *   - a `CONTRACT_ERRORS` entry in src/lib/errors.ts, and
 *   - the `en.json` translation keys (title/message/recovery) that entry's
 *     `i18nKey` points at.
 *
 * If a new variant is added on-chain without updating the frontend, this
 * test fails instead of users silently seeing the generic fallback message.
 *
 * Run with: pnpm test src/test/contract-error-coverage.test.ts
 */

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { resolve, join } from "node:path"
import { CONTRACT_ERRORS } from "@/lib/errors"
import en from "@/i18n/locales/en.json"

const CONTRACTS_DIR = resolve(__dirname, "../../contracts")

/** Matches the Rust enum body: `pub enum ContractError { ... }`. */
const ENUM_BLOCK_RE = /pub\s+enum\s+ContractError\s*\{([\s\S]*?)\n\}/

/**
 * Matches a single variant declaration line, e.g. `    AlreadyInitialized = 27,`.
 * Doc comments (`///`) and plain comments (`//`) above a variant don't match
 * this pattern themselves, so they're naturally excluded.
 */
const VARIANT_LINE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+\s*,?\s*$/gm

/**
 * Discover every `contracts/<name>/src/lib.rs` file that actually defines a
 * `ContractError` enum (e.g. `token-locker`, `lp-locker` — not shared crates
 * like `locker-common`), and extract the set of variant names declared in it.
 */
function findContractErrorVariants(): Map<string, string[]> {
  const result = new Map<string, string[]>()
  const entries = readdirSync(CONTRACTS_DIR)

  for (const entry of entries) {
    const libRsPath = join(CONTRACTS_DIR, entry, "src", "lib.rs")
    let stat: ReturnType<typeof statSync>
    try {
      stat = statSync(libRsPath)
    } catch {
      continue
    }
    if (!stat.isFile()) continue

    const source = readFileSync(libRsPath, "utf-8")
    const enumMatch = source.match(ENUM_BLOCK_RE)
    if (!enumMatch) continue

    const body = enumMatch[1]
    const variants: string[] = []
    for (const lineMatch of body.matchAll(VARIANT_LINE_RE)) {
      variants.push(lineMatch[1])
    }
    result.set(entry, variants)
  }

  return result
}

describe("contract ContractError → frontend mapping coverage (#1069)", () => {
  const contractVariants = findContractErrorVariants()

  it("finds at least one contract defining a ContractError enum", () => {
    expect(contractVariants.size).toBeGreaterThan(0)
  })

  it("every discovered contract has at least one variant", () => {
    for (const [contract, variants] of contractVariants) {
      expect(variants.length, `${contract}'s ContractError enum should not be empty`).toBeGreaterThan(0)
    }
  })

  // Flatten to the unique set of variant names across all contracts — the
  // frontend mapping is shared, not per-contract.
  const allVariants = Array.from(new Set(Array.from(contractVariants.values()).flat())).sort()

  it.each(allVariants.map((v) => [v] as const))("%s has a CONTRACT_ERRORS entry", (variant) => {
    expect(CONTRACT_ERRORS, `CONTRACT_ERRORS is missing an entry for "${variant}"`).toHaveProperty(variant)
  })

  it.each(allVariants.map((v) => [v] as const))("%s has en.json translation keys", (variant) => {
    const entry = CONTRACT_ERRORS[variant]
    expect(entry, `CONTRACT_ERRORS is missing an entry for "${variant}"`).toBeDefined()

    // i18nKey is e.g. "errors.vestingOutsideLockBounds" — resolve it against
    // the actual en.json tree rather than assuming the shape.
    const parts = entry.i18nKey.split(".")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = en
    for (const part of parts) {
      node = node?.[part]
    }

    expect(node, `en.json is missing the "${entry.i18nKey}" node for "${variant}"`).toBeDefined()
    expect(node.title, `en.json "${entry.i18nKey}.title" is missing for "${variant}"`).toBeTruthy()
    expect(node.message, `en.json "${entry.i18nKey}.message" is missing for "${variant}"`).toBeTruthy()
    // recovery may legitimately be null (no actionable recovery step), but the
    // key itself must be present.
    expect(
      Object.prototype.hasOwnProperty.call(node, "recovery"),
      `en.json "${entry.i18nKey}.recovery" key is missing for "${variant}"`,
    ).toBe(true)
  })
})
