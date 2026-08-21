import type { Meta, StoryObj } from "@storybook/react"
import type { Lock } from "@/types/lock"
import { BulkConfirmModal } from "./BulkConfirmModal"

const meta = {
  title: "Locks/BulkConfirmModal",
  component: BulkConfirmModal,
  tags: ["autodocs"],
} satisfies Meta<typeof BulkConfirmModal>

export default meta
type Story = StoryObj<typeof meta>

const now = Date.now()
const in90Days = now + 90 * 24 * 60 * 60 * 1000

const lockA: Lock = {
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
  createdAt: now - 86400000,
  unlockAt: in90Days,
  extendedCount: 0,
}

const lockB: Lock = {
  ...lockA,
  id: "2",
  amount: 25000,
  usdValue: 25000,
}

const lockC: Lock = {
  ...lockA,
  id: "3",
  kind: "lp",
  status: "unlockable",
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
  amount: 500,
  usdValue: 5000,
  unlockAt: now - 1000,
  extendedCount: 3,
}

type OnConfirm = (
  value: string,
  onItemSettled: (id: string, outcome: { status: "success" | "error" }) => void,
) => Promise<void>
const noopConfirm: OnConfirm = async () => {}
const noopClose = () => {}

export const ExtendSingle: Story = {
  args: {
    action: "extend",
    locks: [lockA],
    onConfirm: noopConfirm,
    onClose: noopClose,
  },
}

export const TransferSingle: Story = {
  args: {
    action: "transfer",
    locks: [lockA],
    onConfirm: noopConfirm,
    onClose: noopClose,
  },
}

export const ExtendMultiple: Story = {
  args: {
    action: "extend",
    locks: [lockA, lockB, lockC],
    onConfirm: noopConfirm,
    onClose: noopClose,
  },
}

export const TransferMixedKinds: Story = {
  args: {
    action: "transfer",
    locks: [lockA, lockC],
    onConfirm: noopConfirm,
    onClose: noopClose,
  },
}
