import { describe, it, expect } from "vitest"
import { calculateVestedRaw, calculateVestingClaimable } from "@/lib/vesting"

/**
 * Parity tests for `calculateVestedRaw`, mirroring the Rust unit tests for
 * `calculate_vested` in contracts/locker-common/src/lib.rs. Every case here
 * has a matching `#[test]` on the Rust side with the same name/inputs, so
 * the UI and the contract can never silently drift apart again.
 */
describe("calculateVestedRaw (parity with contracts/locker-common calculate_vested)", () => {
  it("vested_before_start_is_zero", () => {
    expect(calculateVestedRaw(1_000n, 100n, 200n, 50n)).toBe(0n)
  })

  it("vested_after_end_is_full_amount", () => {
    expect(calculateVestedRaw(1_000n, 100n, 200n, 300n)).toBe(1_000n)
  })

  it("vested_at_midpoint_is_half", () => {
    expect(calculateVestedRaw(1_000n, 0n, 1_000n, 500n)).toBe(500n)
  })

  it("vested_zero_duration_returns_full_amount", () => {
    expect(calculateVestedRaw(1_000n, 100n, 100n, 100n)).toBe(1_000n)
    expect(calculateVestedRaw(1_000n, 100n, 100n, 200n)).toBe(1_000n)
  })

  it("vested_zero_amount_is_zero", () => {
    expect(calculateVestedRaw(0n, 0n, 1_000n, 500n)).toBe(0n)
  })

  it("vested_negative_amount_is_zero", () => {
    expect(calculateVestedRaw(-500n, 0n, 1_000n, 500n)).toBe(0n)
  })

  it("vested_at_start_is_zero", () => {
    expect(calculateVestedRaw(1_000n, 100n, 200n, 100n)).toBe(0n)
  })

  it("vested_at_end_is_full_amount", () => {
    expect(calculateVestedRaw(1_000n, 100n, 200n, 200n)).toBe(1_000n)
  })

  it("floors non-exact divisions instead of rounding, like the contract's integer division", () => {
    // 7 * 1 / 3 = 2.333... -> floors to 2, same as Rust's i128 division.
    expect(calculateVestedRaw(7n, 0n, 3n, 1n)).toBe(2n)
  })
})

describe("calculateVestingClaimable", () => {
  it("matches the contract at a boundary where float-ms math used to disagree", () => {
    // A schedule where (end - start) isn't a whole number of seconds once
    // converted from ms, so naive float-ms math and integer-seconds math
    // round differently right at the boundary.
    const decimals = 6
    const amount = 1_000
    const start = 0
    const end = 10_500 // 10.5s — not a whole number of seconds
    const vesting = { start, end, released: 0 }

    // At now = end, the contract (seconds, floors `end` to 10) would see
    // now (10s) < duration-equivalent only if duration also floors to 10s;
    // here duration floors to 10s too, so elapsed === duration and the full
    // amount should be vested.
    const claimable = calculateVestingClaimable(amount, decimals, vesting, end)
    expect(claimable).toBe(1_000)
  })

  it("returns 0 once everything vested has already been released, never negative", () => {
    const vesting = { start: 0, end: 1_000_000, released: 1_000 }
    const claimable = calculateVestingClaimable(1_000, 6, vesting, 1_000_000)
    expect(claimable).toBe(0)
  })

  it("returns 0 before the vesting start", () => {
    const vesting = { start: 10_000, end: 20_000, released: 0 }
    const claimable = calculateVestingClaimable(1_000, 6, vesting, 5_000)
    expect(claimable).toBe(0)
  })
})
