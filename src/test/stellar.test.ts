import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rpc as SorobanRpc, nativeToScVal, xdr } from "@stellar/stellar-sdk"
import {
  describeFailedTransaction,
  estimateLockCost,
  getTokenAllowance,
  getTokenBalance,
  invalidateRpcCache,
  resolveSendResult,
  simulateCall,
} from "@/lib/stellar"
  simulateCall,
} from "@/lib/stellar"
import { rpc as SorobanRpc, nativeToScVal } from "@stellar/stellar-sdk"
import { getRpcCacheSize, getTokenAllowance, getTokenBalance, invalidateRpcCache, simulateCall } from "@/lib/stellar"
import { getTokenBalance, invalidateRpcCache, simulateCall } from "@/lib/stellar"
import { getOnChainTokenMeta } from "@/lib/token-metadata"

// Mock the token-metadata module so we can control the on-chain decimals that
// getTokenBalance uses for the raw-amount → whole-token
// conversion (regression for #509).
vi.mock("@/lib/token-metadata", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/token-metadata")>()
  return {
    ...actual,
    getOnChainTokenMeta: vi.fn(),
  }
})

// Real success responses have several fields; the RpcClient (and the
// isSimulationError() check it relies on) only cares that "error" is absent.
const SUCCESS_RESULT = {} as SorobanRpc.Api.SimulateTransactionResponse

const CONTRACT_ID = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveFn: ((value: T) => void) | undefined
  const promise = new Promise<T>((res) => {
    resolveFn = res
  })
  return { promise, resolve: (value: T) => resolveFn?.(value) }
}

function spyOnSimulateTransaction() {
  return vi.spyOn(SorobanRpc.Server.prototype, "simulateTransaction")
}

function spyOnGetFeeStats() {
  return vi.spyOn(SorobanRpc.Server.prototype, "getFeeStats")
}

describe("RpcClient (exercised via simulateCall) — caching, dedup, rate limiting", () => {
  let simulateSpy: ReturnType<typeof spyOnSimulateTransaction>

  beforeEach(() => {
    // Frozen clock so cache-TTL boundaries can be advanced precisely.
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    invalidateRpcCache()
    simulateSpy = spyOnSimulateTransaction()
  })

  afterEach(() => {
    simulateSpy.mockRestore()
    vi.useRealTimers()
  })

  it("dedupes identical concurrent calls into a single underlying RPC request", async () => {
    const gate = deferred<SorobanRpc.Api.SimulateTransactionResponse>()
    simulateSpy.mockReturnValue(gate.promise)

    const call1 = simulateCall(CONTRACT_ID, "get_lock", [])
    const call2 = simulateCall(CONTRACT_ID, "get_lock", [])
    await vi.advanceTimersByTimeAsync(0)

    // Both calls should share the one in-flight request, not fire two.
    expect(simulateSpy).toHaveBeenCalledTimes(1)

    gate.resolve(SUCCESS_RESULT)
    await Promise.all([call1, call2])

    expect(simulateSpy).toHaveBeenCalledTimes(1)
  })

  it("does not dedupe distinct calls", async () => {
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)

    await Promise.all([simulateCall(CONTRACT_ID, "get_lock", []), simulateCall(CONTRACT_ID, "get_other_lock", [])])

    expect(simulateSpy).toHaveBeenCalledTimes(2)
  })

  it("serves cached responses within the TTL without a second network call", async () => {
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)

    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(simulateSpy).toHaveBeenCalledTimes(1)

    // Still within the 10s cache TTL - should be a cache hit.
    await vi.advanceTimersByTimeAsync(9_000)
    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(simulateSpy).toHaveBeenCalledTimes(1)

    // Past the TTL - should re-fetch.
    await vi.advanceTimersByTimeAsync(2_000)
    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(simulateSpy).toHaveBeenCalledTimes(2)
  })

  it("invalidateRpcCache() forces a fresh network call even within the TTL", async () => {
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)

    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(simulateSpy).toHaveBeenCalledTimes(1)

    invalidateRpcCache()

    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(simulateSpy).toHaveBeenCalledTimes(2)
  })

  // #1077: a simulation started before a mutation must not overwrite the
  // cache with pre-mutation data once it resolves after invalidateCache().
  it("does not cache an in-flight result that resolves after invalidateCache()", async () => {
    const gate = deferred<SorobanRpc.Api.SimulateTransactionResponse>()
    const PRE_MUTATION_RESULT = { pre: true } as unknown as SorobanRpc.Api.SimulateTransactionResponse
    const POST_MUTATION_RESULT = { post: true } as unknown as SorobanRpc.Api.SimulateTransactionResponse

    simulateSpy.mockReturnValueOnce(gate.promise)

    // Kick off a read before the mutation; it won't resolve until later.
    const stalePromise = simulateCall(CONTRACT_ID, "get_lock", [])
    await vi.advanceTimersByTimeAsync(0)
    expect(simulateSpy).toHaveBeenCalledTimes(1)

    // Mutation happens and invalidates the cache while the read above is
    // still in flight.
    invalidateRpcCache()

    // The stale simulation now resolves with pre-mutation data.
    gate.resolve(PRE_MUTATION_RESULT)
    const stale = await stalePromise
    expect(stale).toBe(PRE_MUTATION_RESULT)

    // A fresh call for the same key must hit the network again (not reuse
    // the stale in-flight entry, and not serve a cache entry the stale
    // result might have written).
    simulateSpy.mockResolvedValueOnce(POST_MUTATION_RESULT)
    const fresh = await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(fresh).toBe(POST_MUTATION_RESULT)
    expect(simulateSpy).toHaveBeenCalledTimes(2)

    // And that fresh result should now be the one served from cache — the
    // stale result must not have clobbered it.
    const cachedAgain = await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(cachedAgain).toBe(POST_MUTATION_RESULT)
    expect(simulateSpy).toHaveBeenCalledTimes(2)
  })

  it("caps concurrent in-flight requests at 5 and queues the rest", async () => {
    const gates = Array.from({ length: 6 }, () => deferred<SorobanRpc.Api.SimulateTransactionResponse>())
    let callIndex = 0
    simulateSpy.mockImplementation(() => gates[callIndex++].promise)

    // Distinct methods so none of these share a cache/dedup key.
    const calls = gates.map((_, i) => simulateCall(CONTRACT_ID, `method_${i}`, []))
    await vi.advanceTimersByTimeAsync(0)

    // Only MAX_CONCURRENT (5) should have reached the network; the 6th queues.
    expect(simulateSpy).toHaveBeenCalledTimes(5)

    // Draining one in-flight request frees a slot for the queued 6th call.
    gates[0].resolve(SUCCESS_RESULT)
    await vi.advanceTimersByTimeAsync(0)
    expect(simulateSpy).toHaveBeenCalledTimes(6)

    gates.slice(1).forEach((g) => g.resolve(SUCCESS_RESULT))
    await Promise.all(calls)
  })
})

// ── #1078: response cache evicts rather than growing unbounded ──────────────
describe("RpcClient response cache — bounded size (#1078)", () => {
  let simulateSpy: ReturnType<typeof spyOnSimulateTransaction>
// ── #1073 / #1075: estimateLockCost uses the network fee and the shared client ──
describe("estimateLockCost (#1073 network-derived fee, #1075 shared client)", () => {
  let simulateSpy: ReturnType<typeof spyOnSimulateTransaction>
  let feeStatsSpy: ReturnType<typeof spyOnGetFeeStats>

  const SIM_RESULT = { minResourceFee: "5000000" } as unknown as SorobanRpc.Api.SimulateTransactionResponse

  function feeStats(p50: string): SorobanRpc.Api.GetFeeStatsResponse {
    const distribution = {
      max: p50,
      min: p50,
      mode: p50,
      p10: p50,
      p20: p50,
      p30: p50,
      p40: p50,
      p50,
      p60: p50,
      p70: p50,
      p80: p50,
      p90: p50,
      p95: p50,
      p99: p50,
      transactionCount: "1",
      ledgerCount: 1,
    }
    return {
      sorobanInclusionFee: distribution,
      inclusionFee: distribution,
      latestLedger: 1,
    } as SorobanRpc.Api.GetFeeStatsResponse
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    invalidateRpcCache()
    simulateSpy = spyOnSimulateTransaction()
    feeStatsSpy = spyOnGetFeeStats()
  })

  afterEach(() => {
    simulateSpy.mockRestore()
    vi.useRealTimers()
  })

  it("evicts an already-expired entry on the next write instead of keeping it forever", async () => {
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)

    await simulateCall(CONTRACT_ID, "get_lock", [])
    expect(getRpcCacheSize()).toBe(1)

    // Past the 10s TTL: the stale entry is never read again here, so without
    // sweeping on write it would simply sit in the Map forever.
    await vi.advanceTimersByTimeAsync(11_000)
    await simulateCall(CONTRACT_ID, "get_other_lock", [])

    // The expired "get_lock" entry was swept; only the fresh write remains.
    expect(getRpcCacheSize()).toBe(1)
  })

  it("caps total cache size even when many distinct keys are written before anything expires", async () => {
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)

    // One more than the cap, all written well within the TTL window so
    // nothing has expired yet — only the size cap can keep this bounded.
    const entryCount = 201
    for (let i = 0; i < entryCount; i++) {
      await simulateCall(CONTRACT_ID, `method_${i}`, [])
    }

    expect(getRpcCacheSize()).toBeLessThanOrEqual(200)

    // The oldest entry should have been evicted to make room, so it's a
    // cache miss (a fresh network call) rather than served stale/forever.
    simulateSpy.mockClear()
    await simulateCall(CONTRACT_ID, "method_0", [])
    expect(simulateSpy).toHaveBeenCalledTimes(1)
    feeStatsSpy.mockRestore()
    vi.useRealTimers()
  })

  it("reflects the network's p50 Soroban inclusion fee instead of the flat 0.1 XLM default", async () => {
    simulateSpy.mockResolvedValue(SIM_RESULT)
    feeStatsSpy.mockResolvedValue(feeStats("50000"))

    const estimate = await estimateLockCost(CONTRACT_ID, "create_lock", [])

    // 50_000 stroops, not the old hardcoded 1_000_000 (0.1 XLM).
    expect(estimate.networkFee).toBeCloseTo(50_000 / 1e7, 9)
    expect(estimate.networkFee).not.toBeCloseTo(1_000_000 / 1e7, 9)
  })

  it("falls back to the previous hardcoded cap if getFeeStats() fails", async () => {
    simulateSpy.mockResolvedValue(SIM_RESULT)
    feeStatsSpy.mockRejectedValue(new Error("rpc unavailable"))

    const estimate = await estimateLockCost(CONTRACT_ID, "create_lock", [])

    expect(estimate.networkFee).toBeCloseTo(1_000_000 / 1e7, 9)
  })

  it("routes simulation through the shared RpcClient, respecting its concurrency limit", async () => {
    const gates = Array.from({ length: 6 }, () => deferred<SorobanRpc.Api.SimulateTransactionResponse>())
    let callIndex = 0
    simulateSpy.mockImplementation(() => gates[callIndex++].promise)
    feeStatsSpy.mockResolvedValue(feeStats("10000"))

    // Distinct methods so none of these share a cache/dedup key — mirrors the
    // "caps concurrent in-flight requests" case above, but exercised via
    // estimateLockCost instead of simulateCall (issue #1075: estimateLockCost
    // used to call rpc.simulateTransaction directly, bypassing this limit).
    const calls = gates.map((_, i) => estimateLockCost(CONTRACT_ID, `method_${i}`, []))
    await vi.advanceTimersByTimeAsync(0)

    expect(simulateSpy).toHaveBeenCalledTimes(5)

    gates[0].resolve(SIM_RESULT)
    await vi.advanceTimersByTimeAsync(0)
    expect(simulateSpy).toHaveBeenCalledTimes(6)

    gates.slice(1).forEach((g) => g.resolve(SIM_RESULT))
    await Promise.all(calls)
  })
})

// ── #1076: FAILED getTransaction responses decode to a concise message ──────
describe("describeFailedTransaction (#1076)", () => {
  function diagnosticEventWithContractError(code: number): xdr.DiagnosticEvent {
    return new xdr.DiagnosticEvent({
      inSuccessfulContractCall: false,
      event: new xdr.ContractEvent({
        ext: new xdr.ExtensionPoint(0),
        contractId: null,
        type: xdr.ContractEventType.diagnostic(),
        body: new xdr.ContractEventBody(
          0,
          new xdr.ContractEventV0({
            topics: [xdr.ScVal.scvSymbol("error")],
            data: xdr.ScVal.scvError(xdr.ScError.sceContract(code)),
          }),
        ),
      }),
    })
  }

  // A diagnostic event with unrelated data (e.g. a log), to confirm the scan
  // doesn't just grab the first event — it must find the error-typed one.
  function diagnosticLogEvent(): xdr.DiagnosticEvent {
    return new xdr.DiagnosticEvent({
      inSuccessfulContractCall: false,
      event: new xdr.ContractEvent({
        ext: new xdr.ExtensionPoint(0),
        contractId: null,
        type: xdr.ContractEventType.diagnostic(),
        body: new xdr.ContractEventBody(
          0,
          new xdr.ContractEventV0({
            topics: [xdr.ScVal.scvSymbol("log")],
            data: xdr.ScVal.scvSymbol("something_happened"),
          }),
        ),
      }),
    })
  }

  it("decodes a realistic failed-tx fixture to a concise Error(Contract, #N) message", () => {
    const getResult = {
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
      diagnosticEventsXdr: [diagnosticLogEvent(), diagnosticEventWithContractError(4)],
    } as unknown as SorobanRpc.Api.GetFailedTransactionResponse

    const message = describeFailedTransaction(getResult, "deadbeef")

    expect(message).toBe("Transaction failed: Error(Contract, #4)")
    // The message must stay short and never leak the raw fixture/JSON.
    expect(message.length).toBeLessThan(80)
  })

  it("falls back to the transaction result code when there is no contract-error diagnostic event", () => {
    const resultXdr = {
      result: () => ({ switch: () => ({ name: "txInsufficientFee" }) }),
    } as unknown as xdr.TransactionResult

    const getResult = {
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
      diagnosticEventsXdr: [diagnosticLogEvent()],
      resultXdr,
    } as unknown as SorobanRpc.Api.GetFailedTransactionResponse

    const message = describeFailedTransaction(getResult, "deadbeef")

    expect(message).toBe("Transaction failed: txInsufficientFee (tx deadbeef)")
  })

  it("never throws or returns a raw JSON blob, even for a malformed/empty result", () => {
    const getResult = {
      status: SorobanRpc.Api.GetTransactionStatus.FAILED,
    } as unknown as SorobanRpc.Api.GetFailedTransactionResponse

    const message = describeFailedTransaction(getResult, "deadbeef")

    expect(message).toBe("Transaction failed (tx deadbeef)")
    expect(message).not.toContain("{")
  })
})

// ── #509: getTokenBalance / getTokenAllowance use per-token decimals ─────────
describe("getTokenBalance / getTokenAllowance decimals conversion (#509)", () => {
// ── #509: getTokenBalance uses per-token decimals ─────────
describe("getTokenBalance decimals conversion (#509)", () => {
  const TOKEN_ADDRESS = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
  const OWNER = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

  let simulateSpy: ReturnType<typeof spyOnSimulateTransaction>
  let metaMock: ReturnType<typeof vi.fn>

  // Wrap a raw on-chain i128 value in the same response shape simulateCall
  // reads (`result.retval`, converted via scValToNative). Each test controls
  // the raw units and the mocked decimals so the conversion divides by
  // 10 ** decimals, not the old hard-coded 1e7.
  function rawResult(raw: bigint): SorobanRpc.Api.SimulateTransactionResponse {
    return {
      result: {
        retval: nativeToScVal(raw, { type: "i128" }),
      },
    } as unknown as SorobanRpc.Api.SimulateTransactionResponse
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    invalidateRpcCache()
    simulateSpy = spyOnSimulateTransaction()
    metaMock = vi.mocked(getOnChainTokenMeta)
    metaMock.mockReset()
    // Default: the existing 7-decimal path (e.g. native XLM-wrapped assets).
    metaMock.mockResolvedValue({ symbol: "XLM", name: "Stellar Lumens", decimals: 7 })
  })

  afterEach(() => {
    simulateSpy.mockRestore()
    metaMock.mockReset()
    vi.useRealTimers()
  })

  it("divides a 6-decimal token's raw balance by 10^6, not 1e7 (balance)", async () => {
    metaMock.mockResolvedValue({ symbol: "USDC", name: "USD Coin", decimals: 6 })
    simulateSpy.mockResolvedValue(rawResult(1_234_567n)) // 1.234567 USDC

    const balance = await getTokenBalance(TOKEN_ADDRESS, OWNER)

    expect(balance).toBeCloseTo(1.234567, 6)
    // The old hard-coded value (1e7) would have produced 0.1234567.
    expect(balance).not.toBeCloseTo(0.1234567, 6)
  })

  it("keeps 7-decimal tokens unchanged (balance)", async () => {
    simulateSpy.mockResolvedValue(rawResult(12_345_678n)) // 1.2345678 XLM

    const balance = await getTokenBalance(TOKEN_ADDRESS, OWNER)

    expect(balance).toBeCloseTo(1.2345678, 6)
  })

  it("converts an 18-decimal token correctly (large divisor beyond stroops)", async () => {
    metaMock.mockResolvedValue({ symbol: "WETH", name: "Wrapped Ether", decimals: 18 })
    // 1.5e18 raw units → 1.5 whole tokens
    simulateSpy.mockResolvedValue(rawResult(1_500_000_000_000_000_000n))

    const balance = await getTokenBalance(TOKEN_ADDRESS, OWNER)

    expect(balance).toBeCloseTo(1.5, 6)
  })
})

// ── #742: NETWORK treats "staging" as mainnet, consistent with useVerifiedToken ──
// NETWORK is computed once at module import time from VITE_NETWORK, so each
// test here re-imports the module fresh after stubbing the env var (same
// pattern used in env.test.ts).
describe("NETWORK resolution (#742)", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    // Restore (not unstub-all) — this test file's other describe blocks,
    // and src/test/setup.ts's global stubs, rely on VITE_RPC_URL etc.
    // staying set; vi.unstubAllEnvs() would wipe those too.
    vi.stubEnv("VITE_NETWORK", "TESTNET")
  })

  it('treats VITE_NETWORK="staging" as mainnet, not testnet', async () => {
    vi.stubEnv("VITE_NETWORK", "staging")
    const { Networks } = await import("@stellar/stellar-sdk")
    const { NETWORK } = await import("@/lib/stellar")

    // Before this fix, staging resolved to testnet here while
    // useVerifiedToken already treated it as mainnet — a real cross-module
    // inconsistency, since staging's own .env file points RPC/Horizon at
    // mainnet infrastructure.
    expect(NETWORK.id).toBe("mainnet")
    expect(NETWORK.passphrase).toBe(Networks.PUBLIC)
  })

  it('still treats VITE_NETWORK="testnet" as testnet', async () => {
    vi.stubEnv("VITE_NETWORK", "testnet")
    const { Networks } = await import("@stellar/stellar-sdk")
    const { NETWORK } = await import("@/lib/stellar")

    expect(NETWORK.id).toBe("testnet")
    expect(NETWORK.passphrase).toBe(Networks.TESTNET)
  })
})

// ── #1074: estimateLockCost must quote the fee submitCall actually pays ─────
describe("estimateLockCost (#1074)", () => {
  let simulateSpy: ReturnType<typeof spyOnSimulateTransaction>

  beforeEach(() => {
    invalidateRpcCache()
    simulateSpy = spyOnSimulateTransaction()
    simulateSpy.mockResolvedValue(SUCCESS_RESULT)
  })

  afterEach(() => {
    simulateSpy.mockRestore()
  })

  it("quotes the network fee using submitCall's real SOROBAN_FEE (0.1 XLM), not BASE_FEE", async () => {
    const estimate = await estimateLockCost(CONTRACT_ID, "create_lock", [])

    // Before the fix this used BASE_FEE (100 stroops = 0.00001 XLM), which
    // understated the estimate shown before signing by ~0.1 XLM relative to
    // what submitCall actually charges.
    expect(estimate.networkFee).toBeCloseTo(0.1, 7)
    expect(estimate.total).toBeCloseTo(estimate.networkFee + estimate.resourceFee, 7)
  })
})

// ── #1071: each sendTransaction status gets explicit, correct handling ─────
describe("resolveSendResult (#1071)", () => {
  const HASH = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"

  // A minimal double for xdr.TransactionResult: resolveSendResult (via
  // isTxTooLateError) only ever calls `.result().switch().name` or
  // `.toXDR("base64")` on it, so we don't need to build a real XDR struct.
  function fakeErrorResult(resultCodeName: string): xdr.TransactionResult {
    return {
      result: () => ({ switch: () => ({ name: resultCodeName }) }),
      toXDR: () => "AAAAAA==",
    } as unknown as xdr.TransactionResult
  }

  function sendResult(
    status: SorobanRpc.Api.SendTransactionResponse["status"],
    errorResult?: xdr.TransactionResult,
  ): SorobanRpc.Api.SendTransactionResponse {
    return { status, hash: HASH, errorResult } as SorobanRpc.Api.SendTransactionResponse
  }

  it("returns the hash for PENDING, the normal happy path", () => {
    expect(resolveSendResult(sendResult("PENDING"))).toBe(HASH)
  })

  it("returns the hash for DUPLICATE instead of treating it as a failure", () => {
    // DUPLICATE means this exact transaction is already in flight or landed
    // (e.g. a retried submit) — the existing hash should still be polled.
    expect(resolveSendResult(sendResult("DUPLICATE"))).toBe(HASH)
  })

  it("throws a clear, actionable error for TRY_AGAIN_LATER instead of polling", () => {
    // Before #1071, this status fell through to the ~60s getTransaction poll
    // and produced a confusing "not found after 40 attempts" error, even
    // though the transaction was never accepted in the first place.
    expect(() => resolveSendResult(sendResult("TRY_AGAIN_LATER"))).toThrow(/network is busy/i)
  })

  it("maps an ERROR with result code txTooLate to a friendly expired-transaction message", () => {
    expect(() => resolveSendResult(sendResult("ERROR", fakeErrorResult("txTooLate")))).toThrow(
      /expired before it could be submitted/i,
    )
  })

  it("falls back to a generic send error for any other ERROR result code", () => {
    expect(() => resolveSendResult(sendResult("ERROR", fakeErrorResult("txBadSeq")))).toThrow(/^Send error:/)
  })

  it("falls back to a generic send error when ERROR has no errorResult at all", () => {
    expect(() => resolveSendResult(sendResult("ERROR"))).toThrow(/Send error: unknown/)
  })
})
