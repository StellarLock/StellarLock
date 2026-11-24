import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useContractEvents } from "@/hooks/useContractEvents"

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

describe("useContractEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("starts with an empty events list", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    expect(result.current.events).toEqual([])
  })

  it("parses a matching lock_created event from the getEvents response", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        result: {
          events: [
            {
              id: "1",
              ledger: 100,
              ledgerClosedAt: "2026-01-01T00:00:00Z",
              topic: ["lock_created", "lock-abc"],
            },
          ],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const onEvent = vi.fn()
    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT", onEvent }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0]).toMatchObject({
      type: "lock_created",
      lockId: "lock-abc",
      timestamp: new Date("2026-01-01T00:00:00Z").getTime(),
    })
    expect(onEvent).toHaveBeenCalledWith(result.current.events[0])
  })

  it("ignores events whose topic does not match a known event type", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        result: {
          events: [{ id: "1", ledger: 1, topic: ["some_unrelated_topic", "x"] }],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toEqual([])
  })

  it("ignores events with no topic array", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ result: { events: [{ id: "1", ledger: 1 }] } }))
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toEqual([])
  })

  it("extracts the real lock id from topic[1] for lp-locker withdraw/extend/transfer events", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        result: {
          events: [
            { id: "101", ledger: 1, topic: ["lp_lock_withdrawn", "5001"] },
            { id: "102", ledger: 2, topic: ["lp_lock_extended", "5002"] },
            { id: "103", ledger: 3, topic: ["lp_beneficiary_transferred", "5003"] },
          ],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const lockIds = result.current.events.map((e) => e.lockId)
    expect(lockIds).toEqual(["5003", "5002", "5001"])
  })

  it("prepends new events so the most recent event is first", async () => {
    let call = 0
    const fetchMock = vi.fn(() => {
      call += 1
      const topic = call === 1 ? ["lock_created", "first"] : ["lock_withdrawn", "second"]
      return jsonResponse({ result: { events: [{ id: String(call), ledger: call, topic }] } })
    })
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT", pollInterval: 1000 }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.events[0].lockId).toBe("first")

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(result.current.events[0].lockId).toBe("second")
    expect(result.current.events).toHaveLength(2)
  })

  it("emits an event only once even when repeated polls return it again", async () => {
    const fetchMock = vi.fn(() =>
      jsonResponse({
        result: {
          events: [
            {
              id: "1",
              ledger: 100,
              ledgerClosedAt: "2026-01-01T00:00:00Z",
              topic: ["lock_created", "lock-abc"],
            },
          ],
        },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const onEvent = vi.fn()
    const { result } = renderHook(() =>
      useContractEvents({ contractAddress: "CCONTRACT", onEvent, pollInterval: 1000 }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onEvent).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(3)
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(result.current.events).toHaveLength(1)
  })

  it("still emits new distinct events within the next poll", async () => {
    let call = 0
    const firstEvent = { id: "1", ledger: 1, topic: ["lock_created", "first"] }
      const fetchMock = vi.fn(() => {
        call += 1
        const events =
          call === 1
            ? [firstEvent]
            : [firstEvent, { id: "2", ledger: 2, topic: ["lock_withdrawn", "second"] }]
        return jsonResponse({ result: { events } })
      })
    vi.stubGlobal("fetch", fetchMock)

    const onEvent = vi.fn()
    const { result } = renderHook(() =>
      useContractEvents({ contractAddress: "CCONTRACT", onEvent, pollInterval: 1000 }),
    )

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(onEvent).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(result.current.events[0]).toMatchObject({ type: "lock_withdrawn", lockId: "second" })
    expect(result.current.events).toHaveLength(2)
  })

  it("does not throw and leaves events empty when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({}, false, 500)))

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toEqual([])
  })

  it("does not throw and leaves events empty when the RPC returns a JSON-RPC error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: { message: "boom" } })))

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toEqual([])
  })

  it("does not throw when fetch rejects with a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))))

    const { result } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT" }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(result.current.events).toEqual([])
  })

  it("stops polling after unmount", async () => {
    const fetchMock = vi.fn(() => jsonResponse({ result: { events: [] } }))
    vi.stubGlobal("fetch", fetchMock)

    const { unmount } = renderHook(() => useContractEvents({ contractAddress: "CCONTRACT", pollInterval: 1000 }))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const callsBeforeUnmount = fetchMock.mock.calls.length

    unmount()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(fetchMock.mock.calls.length).toBe(callsBeforeUnmount)
  })
})
