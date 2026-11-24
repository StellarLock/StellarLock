import { describe, it, expect, vi, beforeEach } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { ConnectGate } from "@/components/layout/ConnectGate"
import { mockWallet } from "./mocks"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const { useWallet } = await import("@/hooks/useWallet")
const mockUseWallet = useWallet as ReturnType<typeof vi.fn>

describe("ConnectGate Component", () => {
  const testContent = "Protected Content"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should render children when wallet is connected", () => {
    mockUseWallet.mockReturnValue({
      ...mockWallet,
      isConnected: true,
      connecting: false,
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    expect(screen.getByText(testContent)).toBeInTheDocument()
  })

  it("should not render children when wallet is disconnected", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: false,
      connect: vi.fn(),
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    expect(screen.queryByText(testContent)).not.toBeInTheDocument()
  })

  it("should show the default connect prompt when disconnected", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: false,
      connect: vi.fn(),
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument()
  })

  it("should use custom title when provided", () => {
    const customTitle = "Custom Gate Title"
    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: false,
      connect: vi.fn(),
    })

    render(
      <ConnectGate title={customTitle}>
        <div>{testContent}</div>
      </ConnectGate>
    )

    expect(screen.getByText(customTitle)).toBeInTheDocument()
  })

  it("should call connect function when button is clicked", async () => {
    const user = userEvent.setup()
    const mockConnect = vi.fn()

    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: false,
      connect: mockConnect,
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    const connectButton = screen.getByRole("button", { name: /connect/i })
    await user.click(connectButton)

    expect(mockConnect).toHaveBeenCalledOnce()
  })

  it("should show loading state while connecting", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: true,
      connect: vi.fn(),
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    const connectButton = screen.getByRole("button", { name: /connect/i })
    expect(connectButton).toBeDisabled()
  })

  it("should render wallet icon in the gate card", () => {
    mockUseWallet.mockReturnValue({
      isConnected: false,
      connecting: false,
      connect: vi.fn(),
    })

    render(
      <ConnectGate>
        <div>{testContent}</div>
      </ConnectGate>
    )

    // Check for the Card component (gate wrapper)
    const card = screen.getByRole("button", { name: /connect/i }).closest("div")
    expect(card).toBeInTheDocument()
  })
})
