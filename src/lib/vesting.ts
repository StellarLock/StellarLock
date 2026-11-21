/**
 * Linear-vesting math shared between the UI and the Soroban contracts.
 *
 * `calculateVestedRaw` is a direct port of `calculate_vested` in
 * `contracts/locker-common/src/lib.rs`: integer (bigint) arithmetic over
 * whole seconds, with the same floor (truncating) division the contract
 * gets from `i128` division. The previous UI implementation computed the
 * same ratio with floating-point milliseconds, which can disagree with the
 * contract at rounding boundaries — e.g. showing a small claimable amount
 * when the contract would return `NothingToRelease`. Routing both the UI
 * and the PDF export through this helper keeps them in agreement with the
 * contract at every boundary.
 */

/** Mirrors `calculate_vested(amount: i128, start: u64, end: u64, now: u64) -> i128`. */
export function calculateVestedRaw(amountRaw: bigint, start: bigint, end: bigint, now: bigint): bigint {
  if (now < start || amountRaw <= 0n) return 0n

  const elapsed = now - start
  const duration = end - start
  if (duration <= 0n) return amountRaw

  // Integer division floors toward zero for non-negative operands, matching
  // the contract's `i128` division.
  let vested = (amountRaw * elapsed) / duration
  if (vested > amountRaw) vested = amountRaw
  if (vested < 0n) vested = 0n
  return vested
}

/** Converts a display-unit amount (e.g. `1234.56`) to the token's raw integer unit. */
export function toRawUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.round(amount * 10 ** decimals))
}

/** Converts a raw integer unit amount back to a display-unit number. */
export function fromRawUnits(amountRaw: bigint, decimals: number): number {
  return Number(amountRaw) / 10 ** decimals
}

/** Floors a Unix-ms timestamp to whole Unix seconds, as the contract stores time. */
export function msToSeconds(ms: number): bigint {
  return BigInt(Math.floor(ms / 1000))
}

export interface VestingLike {
  /** Unix ms when linear vesting begins. */
  start: number
  /** Unix ms when fully vested. */
  end: number
  /** Amount already released to the beneficiary, in display units. */
  released: number
}

/**
 * Claimable = vested-to-date minus already-released, computed with the same
 * integer/seconds math as the contract (via `calculateVestedRaw`), then
 * converted back to display units. Never negative.
 */
export function calculateVestingClaimable(
  amount: number,
  decimals: number,
  vesting: VestingLike,
  nowMs: number = Date.now(),
): number {
  const amountRaw = toRawUnits(amount, decimals)
  const releasedRaw = toRawUnits(vesting.released, decimals)
  const startSec = msToSeconds(vesting.start)
  const endSec = msToSeconds(vesting.end)
  const nowSec = msToSeconds(nowMs)

  const vestedRaw = calculateVestedRaw(amountRaw, startSec, endSec, nowSec)
  let claimableRaw = vestedRaw - releasedRaw
  if (claimableRaw < 0n) claimableRaw = 0n

  return fromRawUnits(claimableRaw, decimals)
}
