import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import { render } from "./utils"
import { RpcStatusIndicator, RpcStatusBanner } from "@/components/layout/RpcStatus"
import type { RpcStatus } from "@/hooks/useRpcHealth"

// Mock the useRpcHealth hook to control status in each test
vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(),
}))

// Mock WalletProvider used by the render utility to avoid @stellar/freighter-api
vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const { useRpcHealth } = await import("@/hooks/useRpcHealth")
const mockUseRpcHealth = useRpcHealth as ReturnType<typeof vi.fn>

describe("RpcStatusIndicator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const cases: Array<{ status: RpcStatus; iconTestId: string; label: string }> = [
    { status: "connected", iconTestId: "Wifi", label: "Connected" },
    { status: "slow", iconTestId: "AlertCircle", label: "Slow" },
    { status: "disconnected", iconTestId: "WifiOff", label: "Disconnected" },
  ]

  it.each(cases)("should render $status state with $label label", ({ status, label }) => {
    mockUseRpcHealth.mockReturnValue({ status, lastChecked: new Date() })

    render(<RpcStatusIndicator />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

describe("RpcStatusBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render nothing when connected", () => {
    mockUseRpcHealth.mockReturnValue({ status: "connected", lastChecked: new Date() })

    const { container } = render(<RpcStatusBanner />)

    // The render wrapper (AnnouncerProvider) adds its own live regions,
    // so assert no banner markup (border-b status box) is present
    expect(container.querySelector('[role="status"].border-b')).toBeNull()
    expect(screen.queryByText(/Stellar network is unreachable/i)).not.toBeInTheDocument()
  })

  it("should render a disconnected banner when network is unreachable", () => {
    mockUseRpcHealth.mockReturnValue({ status: "disconnected", lastChecked: new Date() })

    render(<RpcStatusBanner />)

    expect(screen.getByText(/Stellar network is unreachable/i)).toBeInTheDocument()
    expect(screen.getByText(/Some features may be unavailable/i)).toBeInTheDocument()
  })

  it("should render a slow network banner when response is degraded", () => {
    mockUseRpcHealth.mockReturnValue({ status: "slow", lastChecked: new Date() })

    render(<RpcStatusBanner />)

    expect(screen.getByText(/Slow network connection/i)).toBeInTheDocument()
    expect(screen.getByText(/Responses may take longer/i)).toBeInTheDocument()
  })

  it("should have role=status for accessibility", () => {
    mockUseRpcHealth.mockReturnValue({ status: "disconnected", lastChecked: new Date() })

    const { container } = render(<RpcStatusBanner />)

    // AnnouncerProvider also renders a visually-hidden role="status" live region,
    // so scope the assertion to the actual banner
    const banners = container.querySelectorAll('[role="status"].border-b')
    expect(banners.length).toBe(1)
    expect(banners[0]).toHaveTextContent(/Stellar network is unreachable/i)
  })
})