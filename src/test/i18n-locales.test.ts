/**
 * Locale key parity check — Issue #1104
 *
 * Ensures every non-English locale file has exactly the same set of keys as
 * en.json (the reference locale). Missing or extra keys cause this test to
 * fail so incomplete translations can't be merged silently.
 *
 * Run with:  pnpm test:i18n
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, resolve, basename } from "node:path"

const LOCALES_DIR = resolve(__dirname, "../i18n/locales")

// ── helpers ───────────────────────────────────────────────────────────────────

type JsonObject = { [key: string]: JsonValue }
type JsonValue = string | null | boolean | number | JsonObject

/** Recursively collect every dot-separated key path from a JSON object. */
function flatKeys(obj: JsonObject, prefix = ""): Set<string> {
  const result = new Set<string>()
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      for (const nested of flatKeys(v as JsonObject, path)) {
        result.add(nested)
      }
    } else {
      result.add(path)
    }
  }
  return result
}

function loadJson(filePath: string): JsonObject {
  return JSON.parse(readFileSync(filePath, "utf-8")) as JsonObject
}

// ── test ──────────────────────────────────────────────────────────────────────

const enPath = join(LOCALES_DIR, "en.json")
const en = loadJson(enPath)
const enKeys = flatKeys(en)

const otherFiles = readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json") && f !== "en.json")

describe("i18n locale parity", () => {
  for (const file of otherFiles) {
    const locale = basename(file, ".json")

    it(`${locale}.json has no missing keys vs en.json`, () => {
      const other = loadJson(join(LOCALES_DIR, file))
      const otherKeys = flatKeys(other)

      const missing = [...enKeys].filter((k) => !otherKeys.has(k))
      expect(
        missing,
        `${file} is missing ${missing.length} key(s):\n  ${missing.join("\n  ")}`,
      ).toHaveLength(0)
    })

    it(`${locale}.json has no extra keys vs en.json`, () => {
      const other = loadJson(join(LOCALES_DIR, file))
      const otherKeys = flatKeys(other)

      const extra = [...otherKeys].filter((k) => !enKeys.has(k))
      expect(
        extra,
        `${file} has ${extra.length} extra key(s) not in en.json:\n  ${extra.join("\n  ")}`,
      ).toHaveLength(0)
    })
  }
})
