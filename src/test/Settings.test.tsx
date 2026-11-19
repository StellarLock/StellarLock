import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HelmetProvider } from "react-helmet-async"
import { Settings } from "@/pages/Settings"

vi.mock("@/components/onboarding/startOnboardingTour", () => ({
  startOnboardingTour: vi.fn(),
}))

const STORAGE_KEY = "stellarlock:address-book"
const ADDR_A = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR"
const ADDR_B = "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U"

function renderSettings() {
  return render(
    <HelmetProvider>
      <Settings />
    </HelmetProvider>,
  )
}

describe("Settings", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("renders saved address book entries", () => {
    const now = Date.now()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: "1", label: "Team Wallet", address: ADDR_A, createdAt: now, updatedAt: now },
        { id: "2", label: "Treasury", address: ADDR_B, createdAt: now, updatedAt: now },
      ]),
    )

    renderSettings()

    expect(screen.getByRole("heading", { name: "Address Book" })).toBeInTheDocument()
    expect(screen.getByText("Team Wallet")).toBeInTheDocument()
    expect(screen.getByText("Treasury")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit Team Wallet" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Delete Treasury" })).toBeInTheDocument()
  })

  it("shows a validation error when adding an entry with an empty label", async () => {
    const user = userEvent.setup()
    renderSettings()

    await user.click(screen.getByRole("button", { name: /Add Address/ }))
    await user.type(screen.getByLabelText("Stellar Address"), ADDR_A)
    await user.click(screen.getByRole("button", { name: /Save Address/ }))

    expect(screen.getByText("Label is required.")).toBeInTheDocument()
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("renders the Notification Preferences section", () => {
    renderSettings()

    expect(screen.getByRole("heading", { name: "Notification Preferences" })).toBeInTheDocument()
    expect(screen.getByText("Browser Notifications")).toBeInTheDocument()
  })
})
