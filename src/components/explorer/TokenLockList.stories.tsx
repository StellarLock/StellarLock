import type { Meta, StoryObj } from "@storybook/react"
import { BrowserRouter } from "react-router-dom"
import type { Lock } from "@/types/lock"
import { TokenLockList } from "./TokenLockList"

const meta = {
  title: "Explorer/TokenLockList",
  component: TokenLockList,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div className="max-w-3xl">
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
} satisfies Meta<typeof TokenLockList>

export default meta
type Story = StoryObj<typeof meta>

const now = Date.now()
const in30Days = now + 30 * 24 * 60 * 60 * 1000
const in90Days = now + 90 * 24 * 60 * 60 * 1000
const in180Days = now + 180 * 24 * 60 * 60 * 1000
const ago7Days = now - 7 * 24 * 60 * 60 * 1000

const tokenLockLocked: Lock = {
  id: "1",
  kind: "token",
  status: "locked",
  token: {
    address: "CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "https://example.com/usdc.png",
  },
  creator: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDCREATOR",
  beneficiary: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDBEN",
  amount: 10000,
  usdValue: 10000,
  createdAt: ago7Days,
  unlockAt: in90Days,
  extendedCount: 0,
}

const tokenLockUnlockable: Lock = {
  ...tokenLockLocked,
  id: "2",
  status: "unlockable",
  amount: 5000,
  usdValue: 5000,
  unlockAt: now - 1000, // Already unlocked
}

const lpLockLocked: Lock = {
  id: "3",
  kind: "lp",
  status: "locked",
  token: {
    address: "CDPV3LFWAXFGXNNKMQTDPYQVTHXQZ7FONAAA4ADJUSTEDPOOL",
    symbol: "SOROSWAP-LP",
    name: "Soroswap LP Token",
    decimals: 7,
  },
  dex: "soroswap",
  poolPair: [
    "CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN",
    "CDPV3LFWAXFGXNNKMQTDPYQVTHXQZ7FONAAA4ADJUSTEDOTHER",
  ],
  creator: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDCREATOR",
  beneficiary: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDBEN",
  amount: 500,
  usdValue: 5000,
  createdAt: ago7Days,
  unlockAt: in180Days,
  extendedCount: 0,
}

const lpLockExtended: Lock = {
  ...lpLockLocked,
  id: "4",
  status: "unlockable",
  amount: 750,
  usdValue: 7500,
  unlockAt: now - 1000,
  extendedCount: 3,
}

const tokenLockWithMetadata: Lock = {
  ...tokenLockLocked,
  id: "5",
  amount: 25000,
  usdValue: 25000,
  unlockAt: in30Days,
  metadata: {
    description: "Team treasury reserved for the 2026 roadmap.",
    projectUrl: "https://example.com",
  },
}

export const Empty: Story = {
  args: {
    locks: [],
  },
}

export const WithTokenLocks: Story = {
  args: {
    locks: [tokenLockLocked, tokenLockUnlockable],
  },
}

export const WithLPLocks: Story = {
  args: {
    locks: [lpLockLocked, lpLockExtended],
  },
}

export const MixedKinds: Story = {
  args: {
    locks: [tokenLockLocked, lpLockLocked, tokenLockUnlockable, lpLockExtended],
  },
}

export const WithMetadataAndExtended: Story = {
  args: {
    locks: [tokenLockWithMetadata, lpLockExtended],
  },
}
