import { describe, it, expect } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { AnnouncerProvider, useAnnouncer } from "@/hooks/useAnnouncer"

function Announcer({ message, priority }: { message: string; priority?: "polite" | "assertive" }) {
  const { announce } = useAnnouncer()
  return <button onClick={() => announce(message, priority)}>fire</button>
}

describe("AnnouncerProvider", () => {
  it("renders both aria-live regions", () => {
    render(
      <AnnouncerProvider>
        <span>content</span>
      </AnnouncerProvider>,
    )

    const polite = document.querySelector('[aria-live="polite"]')
    const assertive = document.querySelector('[aria-live="assertive"]')

    expect(polite).toBeInTheDocument()
    expect(polite).toHaveAttribute("role", "status")
    expect(assertive).toBeInTheDocument()
    expect(assertive).toHaveAttribute("role", "alert")
  })

  it("announces polite messages into the status region", async () => {
    render(
      <AnnouncerProvider>
        <Announcer message="Withdrawal confirmed." />
      </AnnouncerProvider>,
    )

    act(() => screen.getByRole("button", { name: "fire" }).click())

    await waitFor(() => {
      expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("Withdrawal confirmed.")
    })
  })

  it("routes assertive messages to the alert region, not the polite one", async () => {
    render(
      <AnnouncerProvider>
        <Announcer message="Transaction Cancelled." priority="assertive" />
      </AnnouncerProvider>,
    )

    act(() => screen.getByRole("button", { name: "fire" }).click())

    await waitFor(() => {
      expect(document.querySelector('[aria-live="assertive"]')).toHaveTextContent("Transaction Cancelled.")
    })
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent("")
  })
})
