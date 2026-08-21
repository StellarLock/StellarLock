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

const summary: TokenLockSummary = {
  token: {
    address: "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logo: "https://example.com/usdc.png",
  },
  totalLocked: 250000,
  totalUsdValue: 250000,
  activeLocks: 12,
  nextUnlockAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
  percentOfSupply: 3.2,
  locks: [],
}

export const Default: Story = {
  args: { summary },
}

export const SingleLock: Story = {
  args: {
    summary: {
      ...summary,
      totalLocked: 10000,
      totalUsdValue: 10000,
      activeLocks: 1,
    },
  },
}

export const WithoutPercentOfSupply: Story = {
  args: {
    summary: {
      ...summary,
      percentOfSupply: undefined,
    },
  },
}
