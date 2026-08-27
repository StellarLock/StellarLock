import type { Meta, StoryObj } from "@storybook/react"
import type { Lock } from "@/types/lock"
import { TokenLockList } from "./TokenLockList"
import { BrowserRouter } from "react-router-dom"

const meta = {
  title: "Explorer/TokenLockList",
  component: TokenLockList,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div className="max-w-4xl">
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
const ago30Days = now - 30 * 24 * 60 * 60 * 1000

const tokenLock: Lock = {
  id: "1",
  kind: "token",
  status: "locked",
  token: {
    address: "CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  creator: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDCREATOR",
  beneficiary: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDBEN",
  amount: 10000,
  usdValue: 10000,
  createdAt: ago30Days,
  unlockAt: in90Days,
  extendedCount: 0,
  metadata: {
    description: "Team allocation, 90-day cliff",
  },
}

const lpLock: Lock = {
  id: "2",
  kind: "lp",
  status: "locked",
  token: {
    address: "CDPV3LFWAXFGXNNKMQTDPYQVTHXQZ7FONAAA4ADJUSTEDPOOL",
    symbol: "SOROSWAP-LP",
    name: "Soroswap LP Token",
    decimals: 7,
  },
  dex: "soroswap",
  poolPair: ["CA7QYNF5DQX5ZOY2IEVDWQCKLGK2T4OBJCWTYADJUSTEDTOKEN", "CDPV3LFWAXFGXNNKMQTDPYQVTHXQZ7FONAAA4ADJUSTEDOTHER"],
  creator: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDCREATOR",
  beneficiary: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDBEN",
  amount: 500,
  usdValue: 5000,
  createdAt: ago30Days,
  unlockAt: in30Days,
  extendedCount: 2,
}

const unlockableLock: Lock = {
  ...tokenLock,
  id: "3",
  status: "unlockable",
  unlockAt: now - 1000,
  metadata: undefined,
}

export const Empty: Story = {
  args: {
    locks: [],
  },
}

export const Populated: Story = {
  args: {
    locks: [tokenLock, lpLock, unlockableLock],
  },
}

export const SingleLock: Story = {
  args: {
    locks: [tokenLock],
  },
}
