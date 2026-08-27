/**
 * Unit tests for src/hooks/useContractEventContext.tsx — #467
 *
 * Covers:
 *  - Throws when useContractEventContext is used outside a ContractEventProvider
 *  - Provides an empty events list when mounted with no events yet
 *  - New contract events (from useContractEvents' onEvent) are prepended to `events`
 *  - Registered listeners (addListener) are notified of each new event
 *  - removeListener stops a listener from being notified of further events
 */
import { createElement, type ReactNode } from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"

vi.mock("@/hooks/useContractEvents", () => ({
  useContractEvents: vi.fn(),
}))

import { useContractEvents, type ContractEvent } from "@/hooks/useContractEvents"
import { ContractEventProvider, useContractEventContext } from "@/hooks/useContractEventContext"

const mockUseContractEvents = vi.mocked(useContractEvents)

function makeEvent(overrides: Partial<ContractEvent> = {}): ContractEvent {
  return {
    type: "lock_created",
    lockId: "lock-1",
    timestamp: Date.now(),
    data: {},
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(ContractEventProvider, null, children)
}

describe("useContractEventContext", () => {
  let capturedOnEvent: ((event: ContractEvent) => void) | undefined

  beforeEach(() => {
    capturedOnEvent = undefined
    mockUseContractEvents.mockImplementation((options) => {
      capturedOnEvent = options?.onEvent
      return { events: [] }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("throws when used outside a ContractEventProvider", () => {
    expect(() => renderHook(() => useContractEventContext())).toThrow(
      "useContractEventContext must be used within a ContractEventProvider",
    )
  })

  it("starts with an empty events list", () => {
    const { result } = renderHook(() => useContractEventContext(), { wrapper })

    expect(result.current.events).toEqual([])
  })

  it("prepends new events emitted via useContractEvents' onEvent callback", () => {
    const { result } = renderHook(() => useContractEventContext(), { wrapper })

    const event1 = makeEvent({ lockId: "lock-1" })
    act(() => {
      capturedOnEvent?.(event1)
    })
    expect(result.current.events).toEqual([event1])

    const event2 = makeEvent({ lockId: "lock-2", type: "lock_withdrawn" })
    act(() => {
      capturedOnEvent?.(event2)
    })
    expect(result.current.events).toEqual([event2, event1])
  })

  it("notifies registered listeners of each new event", () => {
    const { result } = renderHook(() => useContractEventContext(), { wrapper })
    const listener = vi.fn()

    act(() => {
      result.current.addListener(listener)
    })

    const event = makeEvent()
    act(() => {
      capturedOnEvent?.(event)
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(event)
  })

  it("stops notifying a listener after removeListener", () => {
    const { result } = renderHook(() => useContractEventContext(), { wrapper })
    const listener = vi.fn()

    act(() => {
      result.current.addListener(listener)
    })
    act(() => {
      capturedOnEvent?.(makeEvent({ lockId: "first" }))
    })
    expect(listener).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.removeListener(listener)
    })
    act(() => {
      capturedOnEvent?.(makeEvent({ lockId: "second" }))
    })

    // Still only called once — the removed listener wasn't notified of "second"
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
