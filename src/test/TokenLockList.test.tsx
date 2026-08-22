import { describe, it, expect, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import { render } from "./utils"
import { TokenLockList } from "@/components/explorer/TokenLockList"
import type { Lock } from "@/types/lock"

// TokenLockList renders subcomponents (CopyButton etc.) which may pull in
// hooks; the render wrapper provides all providers, so we only need to mock
// the WalletProvider to avoid loading @stellar/freighter-api.
vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const VALID_PUBLIC_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
const VALID_CONTRACT_ADDRESS = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

const baseLock: Lock = {
  id: "1",
  kind: "token",
  status: "locked",
  token: {
    address: VALID_CONTRACT_ADDRESS,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  creator: VALID_PUBLIC_KEY,
  beneficiary: VALID_PUBLIC_KEY,
  amount: 1000,
  usdValue: 1000,
  createdAt: Date.now() - 86400000,
  unlockAt: Date.now() + 86400000 * 30,
  extendedCount: 0,
}

describe("TokenLockList", () => {
  it("should render locks sorted by unlock date (earliest first)", () => {
    const laterLock: Lock = { ...baseLock, id: "2", unlockAt: baseLock.unlockAt + 86400000 * 10 }
    const earlierLock: Lock = { ...baseLock, id: "3", unlockAt: baseLock.unlockAt - 86400000 * 10 }

    render(<TokenLockList locks={[laterLock, baseLock, earlierLock]} />)

    // formatAmount(1000, { compact: true }) → "1K"
    const rows = screen.getAllByText("1K")
    expect(rows.length).toBe(3)
  })

  it("should render the desktop header row", () => {
    render(<TokenLockList locks={[baseLock]} />)

    expect(screen.getByText("Amount")).toBeInTheDocument()
    expect(screen.getByText("Beneficiary")).toBeInTheDocument()
    expect(screen.getByText("Unlock date")).toBeInTheDocument()
    expect(screen.getByText("Unlocks in")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("should render the beneficiary address", () => {
    render(<TokenLockList locks={[baseLock]} />)

    // shortAddress(GAAA...WHF, 6, 6) → "GAAAAA…AAAWHF"
    // Use a function matcher in case the text is split across nested spans
    expect(screen.getByText((content) => content.includes("GAAAAA") && content.includes("AAAWHF"))).toBeInTheDocument()
  })

  it("should render the USD value", () => {
    render(<TokenLockList locks={[baseLock]} />)

    // formatUsd(1000) → "$1,000.00"
    expect(screen.getByText("$1,000.00")).toBeInTheDocument()
  })

  it("should render a link to the lock detail page", () => {
    render(<TokenLockList locks={[baseLock]} />)

    const link = screen.getByRole("link", { name: `View lock ${baseLock.id}` })
    expect(link).toHaveAttribute("href", "/app/lock/token/1")
  })

  it("should render an lp lock with dex badge", () => {
    const lpLock: Lock = {
      ...baseLock,
      kind: "lp",
      dex: "soroswap" as const,
      poolPair: [VALID_CONTRACT_ADDRESS, "native"],
    }

    render(<TokenLockList locks={[lpLock]} />)

    expect(screen.getByText(/soroswap/i)).toBeInTheDocument()
  })

  it("should render extended badge when extendedCount > 0", () => {
    const extendedLock: Lock = { ...baseLock, extendedCount: 2 }

    render(<TokenLockList locks={[extendedLock]} />)

    expect(screen.getByText("2× extended")).toBeInTheDocument()
  })

  it("should render an empty list with no rows", () => {
    const { container } = render(<TokenLockList locks={[]} />)

    expect(container.querySelector("ul")?.children.length).toBe(0)
  })

  it("should render the status badge for a locked lock", () => {
    render(<TokenLockList locks={[baseLock]} />)

    expect(screen.getByText(/Locked/i)).toBeInTheDocument()
  })

  it("should render the lock description metadata when present", () => {
    const withMeta: Lock = { ...baseLock, metadata: { description: "Team vesting" } }

    render(<TokenLockList locks={[withMeta]} />)

    expect(screen.getByText("Team vesting")).toBeInTheDocument()
  })

  it("should render the unlock countdown timer", () => {
    render(<TokenLockList locks={[baseLock]} />)

    const rows = screen.getAllByRole("listitem")
    expect(rows.length).toBe(1)
    const countdown = within(rows[0]).queryByText(/\d+(d|h|m)/i)
    expect(countdown).toBeTruthy()
  })
})