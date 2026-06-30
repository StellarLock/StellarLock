// TODO: Implement multi-step wizard UI for lock creation flow (#147)
// Steps:
//   1 — Select Lock Type (Token Lock vs LP Lock)
//   2 — Token/Pool Selection (validate address, show metadata)
//   3 — Lock Parameters (amount, beneficiary, unlock date, vesting)
//   4 — Review & Confirm (summary, cost estimate, edit per section)
//   5 — Transaction (sign & submit, progress indicator)
//
// Requirements:
//   - Step indicators (progress bar / numbered steps)
//   - Per-step validation before "Next"
//   - Back navigation preserves entered data
//   - sessionStorage persistence (key: "stellarlock:wizard:state")
//   - Mobile-responsive, keyboard-navigable

export {}
