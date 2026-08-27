import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { RecentActivity } from "@/components/discover/RecentActivity"
import type { ContractEvent } from "@/hooks/useContractEventContext"

vi.mock("@/hooks/useContractEventContext", () => ({
  useContractEventContext: vi.fn(),
}))

const { useContractEventContext } = await import("@/hooks/useContractEventContext")
const mockUseContractEventContext = useContractEventContext as ReturnType<typeof vi.fn>

function makeEvent(overrides: Partial<ContractEvent> = {}): ContractEvent {
  return {
    type: "lock_created",
    lockId: "42",
    timestamp: Date.now(),
    data: {
      raw: {
        creator: "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567",
        amount: "1000",
        token: "GTOKENABCDEFGHIJKLMNOPQRSTUVWXYZ23",
        unlockAt: Date.now() + 3_600_000,
      },
    },
    ...overrides,
  }
}

function renderComponent() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <RecentActivity />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe("RecentActivity", () => {
  beforeEach(() => {
    mockUseContractEventContext.mockReset()
  })

  it("renders the empty state when there are no events", () => {
    mockUseContractEventContext.mockReturnValue({ events: [] })

    renderComponent()

    expect(screen.getByText("No recent activity yet.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /pause/i })).not.toBeInTheDocument()
  })

  it("renders a feed entry for a lock_created event, linking to the lock detail page", () => {
    mockUseContractEventContext.mockReturnValue({ events: [makeEvent({ lockId: "42" })] })

    renderComponent()

    expect(screen.getByText("New lock created")).toBeInTheDocument()
    expect(screen.getByText("Created")).toBeInTheDocument()

    const link = screen.getByText("New lock created").closest("a")
    expect(link).toHaveAttribute("href", "/app/lock/token/42")
  })

  it("renders a feed entry for an lp_lock_withdrawn event", () => {
    mockUseContractEventContext.mockReturnValue({
      events: [
        makeEvent({
          type: "lp_lock_withdrawn",
          lockId: "7",
          data: { raw: { beneficiary: "GBENEFICIARY234567890ABCDEFGHIJ", amount: "50", token: "GLP23456" } },
        }),
      ],
    })

    renderComponent()

    expect(screen.getByText("LP lock withdrawn")).toBeInTheDocument()
    expect(screen.getByText("Withdrawn")).toBeInTheDocument()
  })

  it("caps the rendered feed at 50 items even when more events are provided", () => {
    const events = Array.from({ length: 60 }, (_, i) =>
      makeEvent({ type: "lock_withdrawn", lockId: String(i), timestamp: i, data: { raw: { amount: "1" } } }),
    )
    mockUseContractEventContext.mockReturnValue({ events })

    renderComponent()

    expect(screen.getAllByText("Lock withdrawn")).toHaveLength(50)
  })

  it("toggles the pause/resume control when clicked", async () => {
    const user = userEvent.setup()
    mockUseContractEventContext.mockReturnValue({ events: [makeEvent()] })

    renderComponent()

    const pauseButton = screen.getByRole("button", { name: /pause/i })
    await user.click(pauseButton)

    expect(screen.getByRole("button", { name: /resume/i })).toBeInTheDocument()
  })
})
