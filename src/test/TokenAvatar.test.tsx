import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { screen, waitFor, fireEvent } from "@testing-library/react"
import { render } from "./utils"
import { TokenAvatar } from "@/components/ui/TokenAvatar"
import { VALID_CONTRACT_ADDRESS } from "./mocks"

// ---------------------------------------------------------------------------
// Mock getTokenMetadata so tests don't hit real network calls
// ---------------------------------------------------------------------------

vi.mock("@/lib/token-metadata", () => ({
  getTokenMetadata: vi.fn(),
}))

import { getTokenMetadata } from "@/lib/token-metadata"

const mockGetTokenMetadata = vi.mocked(getTokenMetadata)

describe("TokenAvatar", () => {
  beforeEach(() => {
    mockGetTokenMetadata.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Monogram fallback — no contractId
  // -------------------------------------------------------------------------

  it("renders the symbol monogram when no contractId is provided", () => {
    render(<TokenAvatar symbol="XLM" />)
    expect(screen.getByText("XL")).toBeInTheDocument()
  })

  it("renders the first two letters of the symbol uppercased", () => {
    render(<TokenAvatar symbol="usdc" />)
    expect(screen.getByText("US")).toBeInTheDocument()
  })

  it("renders '?' when the symbol is empty", () => {
    render(<TokenAvatar symbol="" />)
    expect(screen.getByText("?")).toBeInTheDocument()
  })

  it("strips non-alphanumeric chars and uses the remaining letters", () => {
    render(<TokenAvatar symbol="$TOKEN" />)
    expect(screen.getByText("TO")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Monogram fallback — API returns no logo
  // -------------------------------------------------------------------------

  it("renders monogram when getTokenMetadata resolves with no logo", async () => {
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo: undefined })
    render(<TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} />)
    // Before the promise resolves the monogram is already visible
    expect(screen.getByText("US")).toBeInTheDocument()
    // After the promise resolves we still see the monogram (no logo URL)
    await waitFor(() => expect(mockGetTokenMetadata).toHaveBeenCalledOnce())
    expect(screen.getByText("US")).toBeInTheDocument()
  })

  it("calls getTokenMetadata with the provided contractId", async () => {
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo: undefined })
    render(<TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} />)
    await waitFor(() => expect(mockGetTokenMetadata).toHaveBeenCalledWith(VALID_CONTRACT_ADDRESS))
  })

  it("does not call getTokenMetadata when contractId is not provided", () => {
    render(<TokenAvatar symbol="XLM" />)
    expect(mockGetTokenMetadata).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Image rendering when a logo URL is available
  // -------------------------------------------------------------------------

  it("renders an <img> with the logo url when metadata contains a logo", async () => {
    const logo = "https://example.com/usdc.png"
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo })
    render(<TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} />)
    const img = await screen.findByRole("img")
    expect(img).toHaveAttribute("src", logo)
    expect(img).toHaveAttribute("alt", "USDC")
  })

  // -------------------------------------------------------------------------
  // Image error → falls back to monogram
  // -------------------------------------------------------------------------

  it("falls back to monogram when the logo image fails to load", async () => {
    const logo = "https://example.com/broken.png"
    mockGetTokenMetadata.mockResolvedValue({ symbol: "TS", logo })
    render(<TokenAvatar symbol="TS" contractId={VALID_CONTRACT_ADDRESS} />)

    const img = await screen.findByRole("img")
    // Simulate the browser failing to load the image
    fireEvent.error(img)

    await waitFor(() => {
      expect(screen.queryByRole("img")).not.toBeInTheDocument()
      expect(screen.getByText("TS")).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Size variants
  // -------------------------------------------------------------------------

  it("renders without error for size='sm'", () => {
    render(<TokenAvatar symbol="XLM" size="sm" />)
    expect(screen.getByText("XL")).toBeInTheDocument()
  })

  it("renders without error for size='lg'", () => {
    render(<TokenAvatar symbol="XLM" size="lg" />)
    expect(screen.getByText("XL")).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // Verified badge
  // -------------------------------------------------------------------------

  it("does not show verified badge when showVerified=false (default)", async () => {
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo: undefined, verified: true })
    const { container } = render(
      <TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} />,
    )
    await waitFor(() => expect(mockGetTokenMetadata).toHaveBeenCalledOnce())
    expect(container.querySelector(".bg-green-500")).not.toBeInTheDocument()
  })

  it("shows verified badge when showVerified=true and metadata.verified=true", async () => {
    const logo = "https://example.com/usdc.png"
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo, verified: true })
    const { container } = render(
      <TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} showVerified />,
    )
    await screen.findByRole("img")
    await waitFor(() => {
      expect(container.querySelector(".bg-green-500")).toBeInTheDocument()
    })
  })

  it("does not show verified badge when showVerified=true but metadata.verified=false", async () => {
    mockGetTokenMetadata.mockResolvedValue({ symbol: "USDC", logo: undefined, verified: false })
    const { container } = render(
      <TokenAvatar symbol="USDC" contractId={VALID_CONTRACT_ADDRESS} showVerified />,
    )
    await waitFor(() => expect(mockGetTokenMetadata).toHaveBeenCalledOnce())
    expect(container.querySelector(".bg-green-500")).not.toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // getTokenMetadata rejection → stays on monogram
  // -------------------------------------------------------------------------

  it("stays on monogram when getTokenMetadata rejects", async () => {
    mockGetTokenMetadata.mockRejectedValue(new Error("network error"))
    render(<TokenAvatar symbol="ERR" contractId={VALID_CONTRACT_ADDRESS} />)
    await waitFor(() => expect(mockGetTokenMetadata).toHaveBeenCalledOnce())
    expect(screen.getByText("ER")).toBeInTheDocument()
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
  })
})
