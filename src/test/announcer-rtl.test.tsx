import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import { AnnouncerProvider, useAnnouncer } from "@/hooks/useAnnouncer"
import i18n from "@/i18n"

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

describe("RTL document direction", () => {
  const original = i18n.language

  beforeEach(async () => {
    await i18n.changeLanguage("en")
  })

  afterEach(async () => {
    await i18n.changeLanguage(original)
  })

  it("switches dir/lang to rtl for Arabic and back for English", async () => {
    expect(document.documentElement.dir).toBe("ltr")
    expect(document.documentElement.lang).toBe("en")

    await i18n.changeLanguage("ar")
    expect(document.documentElement.dir).toBe("rtl")
    expect(document.documentElement.lang).toBe("ar")

    await i18n.changeLanguage("en")
    expect(document.documentElement.dir).toBe("ltr")
    expect(document.documentElement.lang).toBe("en")
  })

  it("treats regional Arabic tags as RTL", async () => {
    await i18n.changeLanguage("ar-EG")
    expect(document.documentElement.dir).toBe("rtl")
    expect(document.documentElement.lang).toBe("ar")
  })
})
