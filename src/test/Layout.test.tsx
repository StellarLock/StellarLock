import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { Layout } from "@/components/layout/Layout"
import { mockWallet } from "./mocks"

// ── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock("@/hooks/useTheme", () => ({
  useTheme: vi.fn(),
}))

vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(),
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

// react-router-dom's <Outlet /> renders nothing in unit tests by default, which
// is fine — we just need to confirm the shell renders its landmark regions.
const { useWallet } = await import("@/hooks/useWallet")
const { useTheme } = await import("@/hooks/useTheme")
const { useRpcHealth } = await import("@/hooks/useRpcHealth")

const mockUseWallet = useWallet as ReturnType<typeof vi.fn>
const mockUseTheme = useTheme as ReturnType<typeof vi.fn>
const mockUseRpcHealth = useRpcHealth as ReturnType<typeof vi.fn>

function renderLayout(path = "/app/create") {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Layout />
      </MemoryRouter>
    </I18nextProvider>,
  )
}

describe("Layout component", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: false,
      connecting: false,
      connectState: "idle",
      connectError: null,
      connectHelp: null,
      disconnected: false,
      networkChanged: false,
      dismissDisconnectAlert: vi.fn(),
      dismissNetworkAlert: vi.fn(),
    })
    mockUseTheme.mockReturnValue({ theme: "light", toggleTheme: vi.fn() })
    mockUseRpcHealth.mockReturnValue({ status: "connected", lastChecked: null })
  })

  it("renders the main landmark region", () => {
    renderLayout()
    expect(screen.getByRole("main")).toBeInTheDocument()
  })

  it("renders the Navbar header landmark", () => {
    renderLayout()
    expect(screen.getByRole("banner")).toBeInTheDocument()
  })

  it("renders the Footer with navigation links", () => {
    renderLayout()
    const footer = screen.getByRole("contentinfo")
    expect(footer).toBeInTheDocument()
  })

  it("includes the skip-to-content accessibility link", () => {
    renderLayout()
    const skipLink = screen.getByRole("link", { name: /skip to (main )?content/i })
    expect(skipLink).toBeInTheDocument()
    expect(skipLink).toHaveAttribute("href", "#main-content")
  })

  it("the main region has the correct id for skip-link targeting", () => {
    renderLayout()
    const main = screen.getByRole("main")
    expect(main).toHaveAttribute("id", "main-content")
  })

  it("does not render the RpcStatusBanner when the RPC is connected", () => {
    mockUseRpcHealth.mockReturnValue({ status: "connected", lastChecked: null })
    renderLayout()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("renders the RpcStatusBanner when the RPC is disconnected", () => {
    mockUseRpcHealth.mockReturnValue({ status: "disconnected", lastChecked: null })
    renderLayout()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("renders the RpcStatusBanner when the RPC is slow", () => {
    mockUseRpcHealth.mockReturnValue({ status: "slow", lastChecked: null })
    renderLayout()
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("renders footer nav links for Create, My Locks, and History", () => {
    renderLayout()
    const footer = screen.getByRole("contentinfo")
    // Links rendered inside the footer
    const links = footer.querySelectorAll("a[href]")
    const hrefs = Array.from(links).map((l) => l.getAttribute("href"))
    expect(hrefs).toContain("/app/create")
    expect(hrefs).toContain("/app/locks")
    expect(hrefs).toContain("/app/history")
  })

  it("renders the app brand name in the footer", () => {
    renderLayout()
    const footer = screen.getByRole("contentinfo")
    // The localised app name (StellarLock) should appear in the footer
    expect(footer).toHaveTextContent(/stellarlock/i)
  })

  it("renders breadcrumbs for a lock-detail path", () => {
    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter initialEntries={["/app/lock/token/42"]}>
          <Layout />
        </MemoryRouter>
      </I18nextProvider>,
    )

    // Breadcrumb region should be present for nested routes
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()
  })

  it("does not render breadcrumbs on the Create Lock top-level route", () => {
    renderLayout("/app/create")
    expect(screen.queryByRole("navigation", { name: /breadcrumb/i })).not.toBeInTheDocument()
  })
})
