import type { Meta, StoryObj } from "@storybook/react"
import { fn } from "@storybook/test"
import { BrowserRouter } from "react-router-dom"
import type { Lock } from "@/types/lock"
import { LockTable } from "./LockTable"

const meta = {
  title: "Locks/LockTable",
  component: LockTable,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <div className="w-full max-w-6xl">
          <Story />
        </div>
      </BrowserRouter>
    ),
  ],
  argTypes: {
    selectable: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof LockTable>

export default meta
type Story = StoryObj<typeof meta>

const now = Date.now()
const creator = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const beneficiary = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"

const tokenLock: Lock = {
  id: "1042",
  kind: "token",
  status: "locked",
  token: {
    address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  creator,
  beneficiary,
  amount: 12500,
  usdValue: 12500,
  createdAt: now - 30 * 24 * 60 * 60 * 1000,
  unlockAt: now + 90 * 24 * 60 * 60 * 1000,
  extendedCount: 0,
}

const lpLock: Lock = {
  id: "lp-27",
  kind: "lp",
  status: "unlockable",
  token: {
    address: "CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    symbol: "AQUA-USDC LP",
    name: "Aquarius AQUA/USDC Pool Share",
    decimals: 7,
  },
  dex: "aquarius",
  poolPair: [tokenLock.token.address, "CEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE"],
  creator,
  beneficiary,
  amount: 450,
  usdValue: 6840,
  createdAt: now - 120 * 24 * 60 * 60 * 1000,
  unlockAt: now - 2 * 24 * 60 * 60 * 1000,
  extendedCount: 2,
}

const withdrawnLock: Lock = {
  ...tokenLock,
  id: "1019",
  status: "withdrawn",
  token: {
    ...tokenLock.token,
    symbol: "XLM",
    name: "Stellar Lumens",
    address: "CFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF",
  },
  amount: 3200,
  usdValue: 4100,
  unlockAt: now - 14 * 24 * 60 * 60 * 1000,
}

export const Empty: Story = {
  args: {
    locks: [],
    selectable: false,
    selectedIds: new Set<string>(),
    onSelect: fn(),
  },
}

export const RepresentativeLocks: Story = {
  args: {
    locks: [tokenLock, lpLock, withdrawnLock],
    selectable: false,
    selectedIds: new Set<string>(),
    onSelect: fn(),
  },
}

export const Selectable: Story = {
  args: {
    locks: [tokenLock, lpLock, withdrawnLock],
    selectable: true,
    selectedIds: new Set<string>(),
    onSelect: fn(),
  },
}

export const SelectableWithRowsSelected: Story = {
  args: {
    locks: [tokenLock, lpLock, withdrawnLock],
    selectable: true,
    selectedIds: new Set([tokenLock.id, lpLock.id]),
    onSelect: fn(),
  },
}
