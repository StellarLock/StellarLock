import type { Meta, StoryObj } from "@storybook/react"
import type { TokenLockSummary } from "@/types/lock"
import { LockBadge } from "./LockBadge"

const meta = {
  title: "Explorer/LockBadge",
  component: LockBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof LockBadge>

export default meta
type Story = StoryObj<typeof meta>

const lockedSummary: TokenLockSummary = {
  token: {
    address: "CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "https://example.com/usdc.png",
  },
  activeLocks: 1,
  totalUsdValue: 10000,
}

const multiLockSummary: TokenLockSummary = {
  token: {
    address: "CDPV3LFWAXFGXNNKMQTDPYQVTHXQZ7FONAAA4ADJUSTEDPOOL",
    symbol: "SOROSWAP-LP",
    name: "Soroswap LP Token",
    decimals: 7,
    logo: "https://example.com/lp.png",
  },
  activeLocks: 5,
  totalUsdValue: 50000,
}

const withdrawnSummary: TokenLockSummary = {
  token: {
    address: "CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN",
    symbol: "STELLAR",
    name: "Stellar Token",
    decimals: 7,
    logo: "https://example.com/stellar.png",
  },
  activeLocks: 0,
  totalUsdValue: 0,
}

export const Locked: Story = {
  args: {
    summary: lockedSummary,
  },
}

export const MultipleLockedTokens: Story = {
  args: {
    summary: multiLockSummary,
  },
}

export const WithdrawnNoLocks: Story = {
  args: {
    summary: withdrawnSummary,
  },
}
