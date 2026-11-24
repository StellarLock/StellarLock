# Browser storage keys

Every key StellarLock writes to `localStorage` or `sessionStorage`. Nothing here leaves the
browser except where noted. Clearing site data for the StellarLock origin removes all of it.

The list was built by grepping `src/` for `localStorage` and `sessionStorage` (Storybook stories
and tests excluded) plus the i18next language detector config. To check it is still complete:

```bash
grep -rnE "(local|session)Storage\.(get|set|remove)Item" src --include=*.ts --include=*.tsx \
  | grep -vE "\.test\.|\.stories\."
```

## localStorage

| Key | Purpose | Data stored | Retention / when removed | Written by |
|---|---|---|---|---|
| `stellarlock:wallet` | Restore the wallet connection on reload | Connected public key (`G…`) | Removed on disconnect, or when the wallet reports a different or no address | [WalletProvider.tsx](../src/hooks/WalletProvider.tsx) |
| `stellarlock:wallet-id` | Remember which wallet module to reconnect with | Wallet kit option id (for example `freighter`) | Removed together with `stellarlock:wallet` | [WalletProvider.tsx](../src/hooks/WalletProvider.tsx) |
| `stellarlock:address-book` | Saved beneficiary addresses | JSON array of `{ id, label, address, createdAt, updatedAt }` | Until the user deletes entries in Settings. Can be exported/imported as JSON | [useAddressBook.ts](../src/hooks/useAddressBook.ts) |
| `stellarlock:notification_prefs` | Per-lock reminder settings | JSON object keyed by lock id: `{ browser, unlockAt, email?, webhookUrl?, types }` | No expiry. Email and webhook URL are also sent to `/api/notifications/subscribe` when the user subscribes | [useNotifications.ts](../src/hooks/useNotifications.ts) |
| `stellarlock:notification_history` | In-app notification centre | JSON array of `{ id, type, lockId, lockKind?, title, message, timestamp, read, data? }` | Capped at 20 items, entries older than 30 days dropped | [useNotifications.ts](../src/hooks/useNotifications.ts) |
| `stellarlock:onboarding_tour_completed` | Don't show the tour again | `"1"` | No expiry. Settings → Onboarding replays the tour but does not clear the key | [OnboardingTour.tsx](../src/components/onboarding/OnboardingTour.tsx) |
| `stellarlock:draft:token-lock` | Restore an unfinished token lock form | JSON `{ tokenAddress, amount, beneficiary, unlockDate }` | Auto-saved while typing. Nothing in the app calls `clearDraft`, so it stays after the lock is submitted | [useDraftStorage.ts](../src/hooks/useDraftStorage.ts) |
| `stellarlock:draft:lp-lock` | Restore an unfinished LP lock form | JSON `{ poolShareAddress, tokenA, tokenB, amount, unlockDate }` | Same as above | [useDraftStorage.ts](../src/hooks/useDraftStorage.ts) |
| `stellarlock:last_lock_created_at:<address>` | 60-second cooldown between lock creations, per wallet | Unix ms timestamp | Never removed. Only read for 60 s after it is written | [CreateTokenLockForm.tsx](../src/components/locks/CreateTokenLockForm.tsx) |
| `stellarlock:last_lock_created_at` | Older global cooldown key | Unix ms timestamp | Still written next to the per-wallet key but no longer read. Never removed | [CreateTokenLockForm.tsx](../src/components/locks/CreateTokenLockForm.tsx) |
| `stellarlock:locks-view-mode` | My Locks card/table toggle | `"card"` or `"table"` | No expiry | [MyLocks.tsx](../src/pages/MyLocks.tsx) |
| `stellarlock:recent_searches` | Recent token searches | JSON array of up to 5 contract addresses | Oldest dropped after 5 | [TokenSearchBar.tsx](../src/components/explorer/TokenSearchBar.tsx) |
| `stellarlock:tx_history` | Transaction History page | JSON array of `{ hash, type, status, timestamp, lockId?, amount?, network }` | Records older than 90 days pruned. History → "Clear all" removes everything | [transaction-history.ts](../src/lib/transaction-history.ts) |
| `stellarlock:token_metadata` | Cache token logos and domains | JSON object keyed by contract id: `{ symbol, name?, logo?, domain?, verified?, cached_at, … }` | Each entry is refetched after 24 h. Stale entries are overwritten, not deleted. `clearTokenMetadataCache()` exists but is not called from the UI | [token-metadata.ts](../src/lib/token-metadata.ts) |
| `theme` | Light/dark mode | `"light"` or `"dark"` | No expiry. Not namespaced, because it predates the `stellarlock:` prefix | [useTheme.ts](../src/hooks/useTheme.ts) |
| `i18nextLng` | Selected UI language | Locale code (for example `en`, `es`) | No expiry. Written by `i18next-browser-languagedetector` (`caches: ["localStorage"]`) | [src/i18n/index.ts](../src/i18n/index.ts) |

## sessionStorage

| Key | Purpose | Data stored | Retention / when removed | Written by |
|---|---|---|---|---|
| `stellarlock:wizard:state` | Keep wizard progress across reloads in the same tab | JSON wizard state (lock type, token, amount, beneficiary, unlock date, vesting) | Cleared when the wizard submits successfully, or when the tab closes | [LockCreationWizard.tsx](../src/components/locks/wizard/LockCreationWizard.tsx) |

## What is sensitive

- No private keys, seed phrases or signed transactions are stored. Signing happens inside the
  wallet extension.
- Public keys and contract addresses are stored in plain text (`stellarlock:wallet`, address
  book, tx history, recent searches, cooldown key names). They are public on-chain, but together
  they link this browser to a wallet.
- `stellarlock:notification_prefs` can contain an email address and webhook URL.

## How to clear it

- **Everything:** browser settings → site data for the StellarLock domain → clear. Or in the
  devtools console: `localStorage.clear(); sessionStorage.clear()`.
- **Only StellarLock-prefixed keys** (keeps `theme` and `i18nextLng`):

  ```js
  Object.keys(localStorage).filter((k) => k.startsWith("stellarlock:")).forEach((k) => localStorage.removeItem(k))
  ```

- **In the app:** disconnecting the wallet clears the two wallet keys; History → "Clear all"
  clears transaction history; Settings lets you delete address book entries and notification
  preferences.

## Conventions for new keys

- Prefix with `stellarlock:` and use a `const` for the key in the module that owns it. Stories
  and tests should import that constant instead of retyping the string.
- Use `:` for scoping, for example `stellarlock:<feature>:<wallet-address>`. Scope per wallet
  when the value should not carry over to another wallet.
- Wrap every access in `try/catch`. Storage can throw in private mode or when full.
- Decide retention up front (cap, TTL or explicit clear) and add a row to this table in the
  same PR.
