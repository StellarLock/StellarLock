import { describe, it, expect } from "vitest"
import { shortAddress, formatAmount, formatUsd } from "@/lib/utils"

describe("shortAddress", () => {
  it("should return an empty string if no address is provided", () => {
    expect(shortAddress("")).toBe("")
  })

  it("should truncate a long address using default lead and trail lengths", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678"
    expect(shortAddress(address)).toBe("0x12…5678")
  })

  it("should respect custom lead and trail lengths", () => {
    const address = "0x1234567890abcdef1234567890abcdef12345678"
    expect(shortAddress(address, 6, 3)).toBe("0x1234…678")
  })

  it("should not truncate if the address length is exactly equal to lead + trail + 3", () => {
    const exactLengthAddress = "12345678901"
    expect(shortAddress(exactLengthAddress)).toBe("12345678901")
  })

  it("should return the original address unmodified if it is shorter than the threshold", () => {
    const shortAddr = "0x123"
    expect(shortAddress(shortAddr)).toBe("0x123")
  })

  it("should not truncate if short address checks against custom limits", () => {
    const address = "123456789"
    expect(shortAddress(address, 2, 2)).toBe("12…89")

    expect(shortAddress(address, 4, 4)).toBe("123456789")
  })
})
describe("formatAmount", () => {
  describe("Standard Formatting (Compact Disabled)", () => {
    it.each([
      [1250.456, undefined, "1,250.46"],
      [1250.456, { decimals: 0 }, "1,250"],
      [1250.456, { decimals: 1 }, "1,250.5"],
      [1250.456, { decimals: 4 }, "1,250.456"],
      [0, undefined, "0"],
      [-5000.75, { decimals: 1 }, "-5,000.8"],
    ])('should format %f with options %o to equal "%s"', (amount, opts, expected) => {
      expect(formatAmount(amount, opts)).toBe(expected)
    })
  })

  describe("Compact Formatting (Compact enabled)", () => {
    it.each([
      [990, "990"],
      [1250, "1.25K"],
      [99000, "99K"],
      [5432100, "5.43M"],
      [1500000000, "1.5B"],
    ])('should compactly format %f to equal "%s"', (amount, expected) => {
      expect(formatAmount(amount, { compact: true })).toBe(expected)
    })
  })
})

describe("formatUsd", () => {
  describe("Standard Notation (< $1,000,000)", () => {
    it.each([
      [0, "$0.00"],
      [12.345, "$12.35"],
      [150000, "$150,000.00"],
      [999999, "$999,999.00"],
      [-500.5, "-$500.50"],
    ])('should format %f to equal "%s"', (value, expected) => {
      expect(formatUsd(value)).toBe(expected)
    })
  })

  describe("Compact Notation (>= $1,000,000)", () => {
    it.each([
      [1000000, "$1.00M"],
      [1540000, "$1.54M"],
      [2500000000, "$2.50B"],
    ])('should compactly format %f to equal "%s"', (value, expected) => {
      expect(formatUsd(value)).toBe(expected)
    })
  })
})
