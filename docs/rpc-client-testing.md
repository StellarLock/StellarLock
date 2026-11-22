# RpcClient: behaviour spec and test plan

`RpcClient` in [src/lib/stellar.ts](../src/lib/stellar.ts) handles every read-only Soroban
simulation (`simulateCall`). [ADR-012](./adr/ADR-012-rpc-client-caching.md) explains why it is
designed this way. This page lists the behaviours a test suite needs to pin down (issue #1159)
and how to test them. None of them have direct tests today.

## Constants

| Constant | Value | Meaning |
|---|---|---|
| `MAX_CONCURRENT` | 5 | Simulations running at the same time; the rest wait in a FIFO queue |
| `MAX_RETRIES` | 3 | Retries after the first attempt (4 attempts in total) |
| Backoff | `1000 × 2^attempt` ms | 1 s, 2 s, 4 s between attempts |
| `CACHE_TTL_MS` | 10 000 | Default response cache lifetime. `cacheTtlMs = 0` disables caching for a call |

Cache key used by `simulateCall`: `${contractId}:${method}:${args.map(a => a.toXDR("base64")).join(",")}`.
The key is supplied by the caller because the transaction XDR contains a timestamp and changes
every second.

## Behaviours to cover

| # | Behaviour | Expected result |
|---|---|---|
| 1 | Concurrency limit | With 6+ calls on distinct keys, only 5 reach `server.simulateTransaction` at once. The 6th starts as soon as any one settles. Queued calls start in FIFO order |
| 2 | Queue slot freed on failure | A call that rejects still decrements `activeCount` and starts the next queued call |
| 3 | Retry and backoff | A network error is retried after 1 s, 2 s and 4 s. A success on any attempt resolves the call. After 4 failures the **last** error is thrown |
| 4 | No retry on simulation errors | A response that resolves with an `error` field (contract panic) is returned once, not retried. `simulateCall` turns it into `Simulation error: …` |
| 5 | Dedupe of identical keys | Concurrent `simulate()` calls with the same key share one promise and one network call. All of them get the same result or the same error |
| 6 | Errors don't poison the cache | After a rejected call, the key is removed from `inflight` and nothing is cached. The next call with that key makes a new network request |
| 7 | Cache hit within TTL | A second call with the same key inside 10 s returns the cached response without a network call |
| 8 | Cache expiry | After the TTL passes, the next call goes to the network again |
| 9 | `cacheTtlMs = 0` | The response is never cached |
| 10 | `invalidateCache()` | Clears cached responses, so the next call fetches again. Requests already in flight still resolve for the callers waiting on them |
| 11 | Retry slots | Each retry attempt goes back through the concurrency queue, so a call waiting on backoff does not hold one of the 5 slots |

### Known race to document in tests

`invalidateCache()` does not cancel in-flight requests. When such a request resolves, its
`.then` **still writes** the response into the cache with a new expiry. So a read that started
before a write, and finished after `invalidateRpcCache()`, can put pre-write data back into the
cache for 10 s. ADR-012 says these results "will not be re-cached", but the code does not do
that. This is the stale-cache race mentioned in issue #1159. A test for behaviour 10 should
assert the intended result (stale data is not cached) and will fail until the race is fixed,
for example with a generation counter that `invalidateCache()` increments and `.then` checks.

## How to test

**Access.** `RpcClient` is not exported. Either:

- export it as `export class RpcClient` (or with a `/** @internal */` named export) and build it
  with a stubbed server, or
- test through `simulateCall` by mocking `@stellar/stellar-sdk`'s
  `rpc.Server.prototype.simulateTransaction` with `vi.spyOn`. This needs a fresh module per test
  (`vi.resetModules()` + dynamic `import()`), because `getClient()` is a module-level singleton
  and its cache would otherwise carry over between tests.

Exporting the class is simpler: the constructor only needs a URL, and the test can replace the
private `server` with an object that has a `simulateTransaction` mock.

**Timers.** Use `vi.useFakeTimers()`. Drive backoff with `await vi.advanceTimersByTimeAsync(ms)`
(not `advanceTimersByTime`, which doesn't flush the promise continuations between retries). Use
`vi.setSystemTime()` for cache expiry, because the cache compares against `Date.now()` and not
a timer.

**Controlling concurrency.** Have the mock return deferred promises you resolve by hand, then
check `mock.calls.length` after each step:

```ts
const pending: Array<(v: unknown) => void> = []
server.simulateTransaction = vi.fn(() => new Promise((r) => pending.push(r)))

const calls = Array.from({ length: 7 }, (_, i) => client.simulate(tx, `k${i}`))
await vi.advanceTimersByTimeAsync(0)
expect(server.simulateTransaction).toHaveBeenCalledTimes(5)

pending[0]({ result: {} })
await vi.advanceTimersByTimeAsync(0)
expect(server.simulateTransaction).toHaveBeenCalledTimes(6)
```

**Retry sketch:**

```ts
server.simulateTransaction = vi
  .fn()
  .mockRejectedValueOnce(new Error("net"))
  .mockRejectedValueOnce(new Error("net"))
  .mockResolvedValue({ result: {} })

const p = client.simulate(tx, "k")
await vi.advanceTimersByTimeAsync(999)
expect(server.simulateTransaction).toHaveBeenCalledTimes(1)
await vi.advanceTimersByTimeAsync(1)      // 1 s backoff elapsed
expect(server.simulateTransaction).toHaveBeenCalledTimes(2)
await vi.advanceTimersByTimeAsync(2000)   // 2 s backoff elapsed
await expect(p).resolves.toEqual({ result: {} })
```

When a test expects a rejection, attach `expect(p).rejects` **before** advancing timers, so
Vitest doesn't report an unhandled rejection.

Put the suite in `src/lib/stellar.test.ts`, next to the existing `src/lib/*.test.ts` files.
