# Issue #1161 — E2E coverage for the notification settings panel on LockDetail

**GitHub:** https://github.com/StellarLock/StellarLock/issues/1161  
**Status:** Open  
**Area:** `e2e/`, `src/components/locks/NotificationSettings.tsx`, `src/hooks/useNotifications.ts`

---

## Problem

`LockDetail` renders `<NotificationSettings lockId address unlockAt />` for any lock
that is still locked. The email row calls the server-side subscription API through
two helpers in `src/hooks/useNotifications.ts`:

| UI action                         | Helper                       | Request                                                           |
|-----------------------------------|------------------------------|-------------------------------------------------------------------|
| Save with a valid email           | `subscribeNotifications`     | `POST /api/notifications/subscribe` with a JSON body              |
| Save with an empty input (after a previous subscribe) | `unsubscribeNotifications` | `DELETE /api/notifications/subscribe?lockId=…&address=…` |

Each half is unit-tested on its own:

- `src/test/NotificationSettings.test.tsx` and `src/test/lock-detail-notifications.test.tsx`
  mock the helpers.
- `api/notifications/*.test.ts` call the handlers directly.

No test checks that the request the browser actually sends matches what the API
expects. If a field is renamed (for example `lockId` → `lock_id`), both suites still
pass while the feature is broken in production.

---

## Contract under test

From `api/notifications/subscribe.ts`, the server expects:

```jsonc
// POST /api/notifications/subscribe   Content-Type: application/json
{
  "lockId": "token:1",          // or bare "1" (normalised to token:1)
  "address": "G…",              // /^G[A-Z2-7]{55}$/
  "email": "a@b.co" | null,     // at least one of email / webhookUrl must be present
  "webhookUrl": "https://…" | null
}
// 201 { id }   |   400 { error }   |   405
```

The frontend always sends both channel keys. When a key has no value, it sends
`null`, never omits the key.

> ⚠️ **Mismatch found while writing this doc.**
> `unsubscribeNotifications` sends `DELETE /api/notifications/subscribe?…`, but
> `api/notifications/subscribe.ts` returns **405** for anything other than `POST`. The
> handler that accepts `DELETE` is `api/notifications/unsubscribe.ts`, which is
> served at `/api/notifications/unsubscribe`, and `vercel.json` has no rewrite
> between the two paths. As written, clearing the email field shows
> "Failed to save email subscription." in production.
>
> Pick a canonical path, fix either the client or the routing, and pin that path in
> the spec below. If the spec mocks `/api/notifications/**` as one glob, it will hide
> this bug, so assert the exact URL and method.

---

## Approach

Add `e2e/notification-settings.spec.ts`. Reuse the existing helpers so the spec
matches the rest of `e2e/`:

- `mockConnectedWallet(page)` from `e2e/wallet-mock.ts`. The email flow requires a
  connected address.
- `mockSorobanRpc(page, { results: { get_lock } })` and `scLock({...})` from
  `e2e/rpc-mock.ts`. Use a lock with `unlockAt` in the future, or the panel renders
  nothing. Copy `MOCK_LOCK` from `e2e/lock-detail.spec.ts`.
- `LockDetailPage` from `e2e/pages/lock-detail.page.ts`. Add a `notifications`
  section to that page object (email input, Save button, alert) instead of
  repeating locators.

Route-mock the API and record every call so the spec can assert on the request:

```ts
type Call = { method: string; url: URL; body: unknown }

async function mockNotificationsApi(page: Page, respond: (c: Call) => { status: number; json?: unknown }) {
  const calls: Call[] = []
  await page.route("**/api/notifications/**", async (route) => {
    const req = route.request()
    const call = { method: req.method(), url: new URL(req.url()), body: req.postDataJSON?.() ?? null }
    calls.push(call)
    const { status, json } = respond(call)
    await route.fulfill({ status, contentType: "application/json", body: json ? JSON.stringify(json) : "" })
  })
  return calls
}
```

Use the English locale strings from `src/i18n/locales/en.json` (`notifications.*`)
for the UI assertions.

---

## Test cases

| # | Scenario | Steps | Assert: request | Assert: UI |
|---|----------|-------|-----------------|------------|
| 1 | Subscribe happy path | Type `alice@example.com`, click **Save** | Exactly one `POST /api/notifications/subscribe`; body equals `{ lockId: "<id>", address: MOCK_WALLET_ADDRESS, email: "alice@example.com", webhookUrl: null }`; `content-type: application/json` | Button shows the spinner (use `holdRequests` to catch it), then the check icon; no `role=alert` |
| 2 | Email is trimmed | Type `  alice@example.com  `, save | `body.email === "alice@example.com"` | Success |
| 3 | Client-side validation | Type `not-an-email`, save | **No** request sent | Alert: "Please enter a valid email address."; input has `aria-invalid="true"` |
| 4 | Wallet not connected | Skip `mockConnectedWallet`, type a valid email, save | No request | Alert: "Connect your wallet to enable email reminders." |
| 5 | Server validation error | API returns `400 { error: "email is not a valid email address" }` | One POST | Alert: "Failed to save email subscription. Please try again."; no check icon |
| 6 | Server error / network | API returns `500`, then `route.abort()` | One POST each | Same generic alert; input re-enabled |
| 7 | Error clears on edit | After case 3, type a character | — | Alert disappears; `aria-invalid="false"` |
| 8 | Webhook is forwarded | Save webhook `https://hooks.example.com/x` first, then subscribe an email | POST body has `webhookUrl: "https://hooks.example.com/x"` | Success |
| 9 | Unsubscribe | Subscribe (case 1), clear the input, save | `DELETE` to the canonical unsubscribe path; query has `lockId=<id>` and `address=MOCK_WALLET_ADDRESS`; no body | No alert; reload the page and the input is empty, because `localStorage` prefs were cleared |
| 10 | Unsubscribe failure | As in case 9, but the API returns `500` | One DELETE | Generic alert; reload the page and the email is still present |
| 11 | Unlocked lock | Lock with `unlockAt` in the past | No request | The "Notifications" heading is not rendered |

Cases 1, 3, 5 and 9 are the minimum that meets the acceptance criteria. The rest are
cheap to add once the helper exists.

---

## Notes

- Notification prefs are kept in `localStorage`. Playwright gives each test a fresh
  context, so tests don't leak state. Case 9 relies on the prefs persisting within
  one test.
- Browser push needs `context.grantPermissions(["notifications"])`. It makes no API
  call, so it is out of scope for this issue.
- When `VITE_API_BASE` is unset, the helpers call relative URLs. The
  `**/api/notifications/**` glob matches both the relative and absolute forms.

---

## Acceptance criteria

- [ ] `e2e/notification-settings.spec.ts` asserts the request method, URL, query and
      JSON body for both subscribe and unsubscribe.
- [ ] Client-side and server-side validation errors are asserted through the
      `role="alert"` message and `aria-invalid`.
- [ ] The subscribe/unsubscribe path mismatch above is resolved, and the spec pins
      the corrected path.
- [ ] `pnpm test:e2e` passes in CI.
