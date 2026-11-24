//! Property-based (fuzz) tests for StellarLock lp-locker invariants.
//!
//! Run with:  cargo test --package lp-locker
//! Set PROPTEST_CASES=10000 for extended CI runs.
//!
//! Vesting properties mirror token-locker's prop_tests module — lp-locker
//! shares the `calculate_vested` helper via locker-common. The split
//! properties cover the basis-point allocation arithmetic used by
//! `create_split_lock` (each non-last beneficiary gets `total * bps /
//! 10_000`, the last gets the remainder so the shares always sum back to
//! the total with no dust lost).

use proptest::prelude::*;

use crate::calculate_vested;

// ── Strategies ────────────────────────────────────────────────────────────────

// Keep amounts in a practical range: 1 stroop to 10 billion tokens.
fn amount_strategy() -> impl Strategy<Value = i128> {
    1_i128..=100_000_000_000_000_000_i128
}

// Timestamps in a realistic range (unix seconds, year 2020–2100).
fn ts_strategy() -> impl Strategy<Value = u64> {
    1_577_836_800_u64..=4_102_444_800_u64
}

// ── Vesting invariants (shared calculate_vested; equivalent to token-locker) ──

proptest! {
    #[test]
    fn vested_never_exceeds_total(
        amount in amount_strategy(),
        start in ts_strategy(),
        end in ts_strategy(),
        now in ts_strategy(),
    ) {
        let vested = calculate_vested(amount, start, end, now);
        prop_assert!(vested >= 0, "vested must be non-negative");
        prop_assert!(vested <= amount, "vested must not exceed total amount");
    }

    #[test]
    fn vested_is_monotone(
        amount in amount_strategy(),
        start in ts_strategy(),
        end in ts_strategy(),
        t1 in ts_strategy(),
        t2 in ts_strategy(),
    ) {
        let (t_early, t_late) = if t1 <= t2 { (t1, t2) } else { (t2, t1) };
        let v_early = calculate_vested(amount, start, end, t_early);
        let v_late  = calculate_vested(amount, start, end, t_late);
        prop_assert!(
            v_late >= v_early,
            "later timestamp {t_late} vested {v_late} < earlier {t_early} vested {v_early}"
        );
    }

    #[test]
    fn nothing_vested_before_start(
        amount in amount_strategy(),
        start in ts_strategy(),
        end in ts_strategy(),
    ) {
        // now is strictly before start
        if start > 0 {
            let now = start - 1;
            let vested = calculate_vested(amount, start, end, now);
            prop_assert_eq!(vested, 0, "nothing should be vested before start");
        }
    }

    #[test]
    fn fully_vested_at_or_after_end(
        amount in amount_strategy(),
        start in ts_strategy(),
        extra_secs in 1_u64..=31_536_000_u64, // 1 second to 1 year
    ) {
        let end = start.saturating_add(extra_secs);
        // now at end or after: should be fully vested
        let vested_at_end = calculate_vested(amount, start, end, end);
        prop_assert_eq!(vested_at_end, amount, "should be fully vested at end");

        let vested_after = calculate_vested(amount, start, end, end + 1);
        prop_assert_eq!(vested_after, amount, "should remain fully vested after end");
    }

    #[test]
    fn zero_duration_vests_everything(
        amount in amount_strategy(),
        ts in ts_strategy(),
    ) {
        // start == end means 0-duration: should immediately return full amount
        let vested = calculate_vested(amount, ts, ts, ts);
        prop_assert_eq!(vested, amount);
    }

    #[test]
    fn no_overflow_on_extreme_vesting(
        amount in 0_i128..=i128::MAX / 2,
        start in 0_u64..u64::MAX / 2,
        end   in 0_u64..u64::MAX / 2,
        now   in 0_u64..u64::MAX / 2,
    ) {
        // Should not panic regardless of inputs.
        let vested = calculate_vested(amount, start, end, now);
        prop_assert!(vested >= 0);
        prop_assert!(vested <= amount.max(0));
    }
}

// ── Split allocation invariants ──────────────────────────────────────────────
//
// `split_shares` mirrors `create_split_lock`'s allocation exactly: every
// beneficiary except the last receives `total * bps / 10_000` (integer
// division, floored) and the last receives the remainder, so the parts
// always sum back to `total` with no dust lost. It returns None on overflow
// (the contract maps that to AmountOverflow). The properties assert the
// total is conserved, that no share exceeds it, and that extreme inputs
// never panic.

fn split_shares(total: i128, bps: &[u64]) -> Option<Vec<i128>> {
    let n = bps.len();
    let mut shares = Vec::with_capacity(n);
    let mut allocated: i128 = 0;
    for (i, &bps_i) in bps.iter().enumerate() {
        let share = if i + 1 == n {
            total.checked_sub(allocated)?
        } else {
            let amount = total.checked_mul(bps_i as i128)? / 10_000;
            allocated = allocated.checked_add(amount)?;
            amount
        };
        shares.push(share);
    }
    Some(shares)
}

fn split_strategy() -> impl Strategy<Value = (i128, Vec<u64>)> {
    (
        amount_strategy(),
        (2_usize..=10_usize).prop_flat_map(|n| proptest::collection::vec(0_u64..=10_000_u64, n)),
    )
}

fn extreme_split_strategy() -> impl Strategy<Value = (i128, Vec<u64>)> {
    (
        0_i128..=i128::MAX / 2,
        (2_usize..=10_usize).prop_flat_map(|n| proptest::collection::vec(1_u64..=10_000_u64, n)),
    )
}

proptest! {
    #[test]
    fn split_shares_sum_to_total(case in split_strategy()) {
        let (total, bps) = case;
        let shares = split_shares(total, &bps).expect("no overflow in practical domain");
        prop_assert_eq!(shares.len(), bps.len());
        let sum: i128 = shares.iter().sum();
        prop_assert_eq!(sum, total, "split shares must conserve the total (no dust lost)");
        for share in &shares {
            prop_assert!(*share <= total, "no share may exceed the total");
        }
    }

    #[test]
    fn split_shares_never_panics_on_extreme_total(case in extreme_split_strategy()) {
        let (total, bps) = case;
        // On overflow split_shares returns None (mirrors the contract's
        // AmountOverflow); otherwise the total must still be conserved.
        if let Some(shares) = split_shares(total, &bps) {
            let sum: i128 = shares.iter().sum();
            prop_assert_eq!(sum, total);
        }
    }
}
