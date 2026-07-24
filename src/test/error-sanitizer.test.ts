import { describe, expect, it } from "vitest"
import { sanitizeError } from "@/lib/error-sanitizer"

describe("error-sanitizer", () => {
    it("maps known Soroban contract error codes without leaking raw messages", () => {
        const err = new Error("Error(Contract, #123) : Error(Contract, #123) AmountMustBePositiveError")
        const se = sanitizeError(err)

        expect(se.code).toBeTypeOf("string")
        // Should use predefined i18n key, not raw text.
        expect(se.i18nKey).toContain("errors.")
        // Ensure we never return raw message text.
        expect(se.message).toContain("errors.")
    })

    it("does not expose endpoint URLs", () => {
        const err = new Error(
            "fetch failed https://soroban-testnet.stellar.org/health: 500 Internal Server Error",
        )
        const se = sanitizeError(err)
        expect(se.message).not.toContain("soroban-testnet")
        expect(se.message).not.toMatch(/https?:\/\//)
    })

    it("falls back to generic error for unknown inputs", () => {
        const se = sanitizeError({ some: "random" })
        expect(se.code).toBe("UNKNOWN")
        expect(se.message).toContain("errors.")
    })
})

