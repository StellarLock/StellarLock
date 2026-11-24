import { describe, it, expect } from "vitest"
import { parseError } from "../lib/errors"

describe("errors.ts", () => {
  describe("CONTRACT_ERRORS mapping", () => {
    it("should match AmountMustBePositive contract error", () => {
      const error = new Error("Error(Contract, #1): AmountMustBePositive")
      const result = parseError(error)
      expect(result.code).toBe("AmountMustBePositive")
      expect(result.i18nKey).toBe("errors.amountMustBePositive")
      expect(result.title).toBe("errors.amountMustBePositive.title")
      expect(result.message).toBe("errors.amountMustBePositive.message")
    })

    it("should match UnlockMustBeFuture contract error", () => {
      const error = new Error("Error(Contract, #2): UnlockMustBeFuture")
      const result = parseError(error)
      expect(result.code).toBe("UnlockMustBeFuture")
      expect(result.i18nKey).toBe("errors.unlockMustBeFuture")
    })

    it("should match StillLocked contract error", () => {
      const error = new Error("Error(Contract, #3): StillLocked")
      const result = parseError(error)
      expect(result.code).toBe("StillLocked")
      expect(result.i18nKey).toBe("errors.stillLocked")
    })

    it("should match AlreadyWithdrawn contract error", () => {
      const error = new Error("Error(Contract, #4): AlreadyWithdrawn")
      const result = parseError(error)
      expect(result.code).toBe("AlreadyWithdrawn")
      expect(result.i18nKey).toBe("errors.alreadyWithdrawn")
      expect(result.recovery).toBeNull()
    })

    it("should match CanOnlyExtend contract error", () => {
      const error = new Error("Error(Contract, #5): CanOnlyExtend")
      const result = parseError(error)
      expect(result.code).toBe("CanOnlyExtend")
      expect(result.i18nKey).toBe("errors.canOnlyExtend")
    })

    it("should match LockDurationTooLong contract error", () => {
      const error = new Error("Error(Contract, #6): LockDurationTooLong")
      const result = parseError(error)
      expect(result.code).toBe("LockDurationTooLong")
      expect(result.i18nKey).toBe("errors.lockDurationTooLong")
    })
  })

  describe("parseWalletError cases", () => {
    describe("user rejection", () => {
      it('should match "user rejected" error message', () => {
        const error = new Error("User rejected the transaction")
        const result = parseError(error)
        expect(result.code).toBe("USER_REJECTED")
        expect(result.i18nKey).toBe("errors.userRejected")
        expect(result.title).toBe("errors.userRejected.title")
        expect(result.message).toBe("errors.userRejected.message")
      })

      it('should match "user denied" error message', () => {
        const error = new Error("User denied the request")
        const result = parseError(error)
        expect(result.code).toBe("USER_REJECTED")
        expect(result.i18nKey).toBe("errors.userRejected")
      })

      it("should be case-insensitive", () => {
        const error = new Error("USER REJECTED THE TRANSACTION")
        const result = parseError(error)
        expect(result.code).toBe("USER_REJECTED")
      })
    })

    describe("insufficient balance", () => {
      it('should match "insufficient balance" error message', () => {
        const error = new Error("Insufficient balance for transaction")
        const result = parseError(error)
        expect(result.code).toBe("INSUFFICIENT_BALANCE")
        expect(result.i18nKey).toBe("errors.insufficientBalance")
        expect(result.title).toBe("errors.insufficientBalance.title")
        expect(result.message).toBe("errors.insufficientBalance.message")
      })

      it('should match "underfunded" error message', () => {
        const error = new Error("Account is underfunded")
        const result = parseError(error)
        expect(result.code).toBe("INSUFFICIENT_BALANCE")
        expect(result.i18nKey).toBe("errors.insufficientBalance")
      })
    })

    describe("wrong network", () => {
      it('should match "wrong network" error message', () => {
        const error = new Error("Wrong network for this wallet")
        const result = parseError(error)
        expect(result.code).toBe("WRONG_NETWORK")
        expect(result.i18nKey).toBe("errors.wrongNetwork")
        expect(result.title).toBe("errors.wrongNetwork.title")
        expect(result.message).toBe("errors.wrongNetwork.message")
      })

      it('should match "network mismatch" error message', () => {
        const error = new Error("Network mismatch detected")
        const result = parseError(error)
        expect(result.code).toBe("WRONG_NETWORK")
        expect(result.i18nKey).toBe("errors.wrongNetwork")
      })
    })

    describe("timeout", () => {
      it('should match "timeout" error message', () => {
        const error = new Error("Transaction timeout")
        const result = parseError(error)
        expect(result.code).toBe("TIMEOUT")
        expect(result.i18nKey).toBe("errors.timeout")
        expect(result.title).toBe("errors.timeout.title")
        expect(result.message).toBe("errors.timeout.message")
      })

      it('should match "timed out" error message', () => {
        const error = new Error("Request timed out")
        const result = parseError(error)
        expect(result.code).toBe("TIMEOUT")
        expect(result.i18nKey).toBe("errors.timeout")
      })

      it("should include recovery link for timeout errors", () => {
        const error = new Error("Transaction timeout")
        const result = parseError(error)
        expect(result.link).not.toBeNull()
        expect(result.link?.label).toBe("Check on Stellar Expert")
        expect(result.link?.url).toContain("stellar.expert")
      })
    })
  })

  describe("fallback to UNKNOWN", () => {
    it("should return UNKNOWN for unrecognized error messages", () => {
      const error = new Error("Some random error that does not match any pattern")
      const result = parseError(error)
      expect(result.code).toBe("UNKNOWN")
      expect(result.i18nKey).toBe("errors.unknown")
      expect(result.title).toBe("errors.unknown.title")
      expect(result.message).toBe("errors.unknown.message")
    })

    it("should not leak raw error text in UNKNOWN fallback", () => {
      const sensitiveMessage = "Database connection failed at 192.168.1.100:5432"
      const error = new Error(sensitiveMessage)
      const result = parseError(error)

      expect(result.code).toBe("UNKNOWN")
      expect(result.message).not.toContain(sensitiveMessage)
      expect(result.message).not.toContain("192.168.1.100")
      expect(result.message).not.toContain("5432")
    })

    it("should handle null or undefined error gracefully", () => {
      const result = parseError(null)
      expect(result.code).toBe("UNKNOWN")
      expect(result.i18nKey).toBe("errors.unknown")
    })

    it("should handle error objects without message property", () => {
      const result = parseError({ status: 500 })
      expect(result.code).toBe("UNKNOWN")
    })
  })

  describe("error structure", () => {
    it("should return a StructuredError with all required fields", () => {
      const error = new Error("User rejected")
      const result = parseError(error)

      expect(result).toHaveProperty("code")
      expect(result).toHaveProperty("title")
      expect(result).toHaveProperty("message")
      expect(result).toHaveProperty("recovery")
      expect(result).toHaveProperty("link")
      expect(result).toHaveProperty("i18nKey")

      expect(typeof result.code).toBe("string")
      expect(typeof result.title).toBe("string")
      expect(typeof result.message).toBe("string")
      expect(typeof result.i18nKey).toBe("string")
      expect(result.link === null || typeof result.link === "object").toBe(true)
      expect(result.recovery === null || typeof result.recovery === "string").toBe(true)
    })

    it("should never return undefined fields", () => {
      const errors = [
        new Error("User rejected"),
        new Error("Insufficient balance"),
        new Error("Random unrecognized error"),
      ]

      errors.forEach((err) => {
        const result = parseError(err)
        Object.values(result).forEach((value) => {
          expect(value).not.toBeUndefined()
        })
      })
    })
  })
})
