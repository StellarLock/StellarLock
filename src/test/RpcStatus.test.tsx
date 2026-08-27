import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { RpcStatusIndicator, RpcStatusBanner } from "@/components/layout/RpcStatus"

vi.mock("@/hooks/useRpcHealth", () => ({
  useRpcHealth: vi.fn(),
}))

const { useRpcHealth } = await import("@/hooks/useRpcHealth")
const mockUseRpcHealth = useRpcHealth as ReturnType<typeof vi.fn>

describe("RpcStatusIndicator", () => {
  beforeEach(() => {
    mockUseRpcHealth.mockReset()
  })

  it("shows a 'Connected' label when the RPC is healthy", () => {
    mockUseRpcHealth.mockReturnValue({ status: "connected", lastChecked: null })

    render(<RpcStatusIndicator />)

    expect(screen.getByText("Connected")).toBeInTheDocument()
  })

  it("shows a 'Slow' label when the RPC is degraded", () => {
    mockUseRpcHealth.mockReturnValue({ status: "slow", lastChecked: null })

    render(<RpcStatusIndicator />)

    expect(screen.getByText("Slow")).toBeInTheDocument()
  })

  it("shows a 'Disconnected' label when the RPC is unreachable", () => {
    mockUseRpcHealth.mockReturnValue({ status: "disconnected", lastChecked: null })

    render(<RpcStatusIndicator />)

    expect(screen.getByText("Disconnected")).toBeInTheDocument()
  })
})

describe("RpcStatusBanner", () => {
  beforeEach(() => {
    mockUseRpcHealth.mockReset()
  })

  it("renders nothing when the RPC is connected", () => {
    mockUseRpcHealth.mockReturnValue({ status: "connected", lastChecked: null })

    const { container } = render(<RpcStatusBanner />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("shows an unreachable-network message when disconnected", () => {
    mockUseRpcHealth.mockReturnValue({ status: "disconnected", lastChecked: null })

    render(<RpcStatusBanner />)

    const banner = screen.getByRole("status")
    expect(banner).toHaveAttribute("aria-live", "polite")
    expect(banner).toHaveTextContent("Stellar network is unreachable.")
    expect(banner.className).toContain("text-destructive")
  })

  it("shows a slow-connection message when degraded", () => {
    mockUseRpcHealth.mockReturnValue({ status: "slow", lastChecked: null })

    render(<RpcStatusBanner />)

    const banner = screen.getByRole("status")
    expect(banner).toHaveTextContent("Slow network connection.")
    expect(banner.className).toContain("text-warning")
  })
})
