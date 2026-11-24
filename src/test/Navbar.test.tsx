import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { MemoryRouter } from "react-router-dom"
import i18n from "@/i18n"
import { Navbar } from "@/components/layout/Navbar"
import { mockWallet } from "./mocks"
import { addNotification, resetNotificationStore } from "@/hooks/useNotifications"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(),
}))

vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(() => ({ status: "connected", lastChecked: null })),
}))

vi.mock("@/lib/env", () => ({
  ENV: {
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    horizonUrl: "https://horizon-testnet.stellar.org",
    contractEnv: "testnet",
    contractVersion: "v1",
    tokenLockerContract: "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW",
    lpLockerContract: "CA3WYETNIF5IAF3VUNQ3SYKZFV45TOFBF7CEZ46I7QEBPWTRM73WLEI4",
    appUrl: "",
    isDev: false,
    showEnvBadge: false,
  },
}))

const { useWallet } = await import("@/hooks/useWallet")
const { useTheme } = await import("@/hooks/useTheme")
const mockUseWallet = useWallet as ReturnType<typeof vi.fn>
const mockUseTheme = useTheme as ReturnType<typeof vi.fn>

function renderNavbar(path = "/") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Navbar />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe("Navbar Component", () => {
  const toggleTheme = vi.fn()

  // The notification bell only renders for a connected wallet.
  function connectWallet() {
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: true,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: false,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
    })
    mockUseTheme.mockReturnValue({ theme: "light", toggleTheme })
    localStorage.clear()
    resetNotificationStore()
  })

  it("renders the brand link and primary nav links", () => {
    renderNavbar()

    expect(screen.getByRole("link", { name: /stellarlock/i })).toHaveAttribute("href", "/")

    const desktopNav = screen.getByRole("navigation", { name: "Main navigation" })
    expect(within(desktopNav).getAllByText("Create Lock").length).toBeGreaterThan(0)
    expect(within(desktopNav).getAllByText("My Locks").length).toBeGreaterThan(0)
    expect(within(desktopNav).getByText("History")).toBeInTheDocument()
    expect(within(desktopNav).getByText("Analytics")).toBeInTheDocument()
  })

  it("shows the connect wallet button when disconnected", () => {
    renderNavbar()

    expect(screen.getByRole("button", { name: /^connect wallet$/i })).toBeInTheDocument()
  })

  it("shows the connected address and disconnect button when connected", () => {
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: true,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
    })

    renderNavbar()

    expect(screen.queryByRole("button", { name: /^connect wallet$/i })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /disconnect wallet/i })).toBeInTheDocument()
  })

  it("calls connect when the connect wallet button is clicked", async () => {
    const user = userEvent.setup()
    const connect = vi.fn()
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: false,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
      connect,
    })

    renderNavbar()

    await user.click(screen.getByRole("button", { name: /^connect wallet$/i }))

    expect(connect).toHaveBeenCalledOnce()
  })

  it("calls disconnect when the disconnect button is clicked", async () => {
    const user = userEvent.setup()
    const disconnect = vi.fn()
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: true,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
      disconnect,
    })

    renderNavbar()

    await user.click(screen.getByRole("button", { name: /disconnect wallet/i }))

    expect(disconnect).toHaveBeenCalledOnce()
  })

  it("disables the connect button while connecting", () => {
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: false,
      connecting: true,
      connectState: "connecting",
      connectError: null,
      connectHelp: null,
    })

    renderNavbar()

    expect(screen.getByRole("button", { name: /connecting/i })).toBeDisabled()
  })

  it("highlights the active route in the desktop nav", () => {
    renderNavbar("/app/locks")

    const desktopNav = screen.getByRole("navigation", { name: "Main navigation" })
    const activeLinks = within(desktopNav).getAllByRole("link", { name: "My Locks" })
    expect(activeLinks[0].className).toContain("text-foreground")

    const inactiveLinks = within(desktopNav).getAllByRole("link", { name: "History" })
    expect(inactiveLinks[0].className).toContain("text-muted-foreground")
  })

  it("toggles the mobile menu open and closed", async () => {
    const user = userEvent.setup()
    renderNavbar()

    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument()

    const menuButton = screen.getByRole("button", { name: /open menu/i })
    expect(menuButton).toHaveAttribute("aria-expanded", "false")

    await user.click(menuButton)

    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true")

    await user.click(screen.getByRole("button", { name: /close menu/i }))

    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument()
  })

  it("closes the mobile menu after selecting a nav link", async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole("button", { name: /open menu/i }))
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" })

    await user.click(within(mobileNav).getAllByRole("link", { name: "History" })[0])

    expect(screen.queryByRole("navigation", { name: "Mobile navigation" })).not.toBeInTheDocument()
  })

  it("toggles the theme when the theme button is clicked", async () => {
    const user = userEvent.setup()
    renderNavbar()

    await user.click(screen.getByRole("button", { name: /switch to dark theme/i }))

    expect(toggleTheme).toHaveBeenCalledOnce()
  })

  it("shows the light-mode label when the theme is dark", () => {
    mockUseTheme.mockReturnValue({ theme: "dark", toggleTheme })

    renderNavbar()

    expect(screen.getByRole("button", { name: /switch to light theme/i })).toBeInTheDocument()
  })

  it("shows an empty notification center until activity is recorded", async () => {
    const user = userEvent.setup()
    connectWallet()
    renderNavbar()

    const bell = screen.getByRole("button", { name: /notifications/i })
    expect(within(bell).queryByText("1")).not.toBeInTheDocument()

    await user.click(bell)
    expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
  })

  it("shows an unread badge and the entry once a lock action is recorded", async () => {
    const user = userEvent.setup()
    connectWallet()
    renderNavbar()

    act(() => {
      addNotification({
        type: "lock_created",
        lockId: "7",
        lockKind: "token",
        title: "Lock created",
        message: "Lock #7 is active.",
      })
    })

    const bell = screen.getByRole("button", { name: /notifications/i })
    expect(within(bell).getByText("1")).toBeInTheDocument()

    await user.click(bell)
    expect(screen.getByText("Lock created")).toBeInTheDocument()
    expect(screen.getByText("Lock #7 is active.")).toBeInTheDocument()
  })
})
