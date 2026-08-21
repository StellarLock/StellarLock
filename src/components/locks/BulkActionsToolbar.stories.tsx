import type { Meta, StoryObj } from "@storybook/react"
import { BulkActionsToolbar } from "./BulkActionsToolbar"

const meta = {
  title: "Locks/BulkActionsToolbar",
  component: BulkActionsToolbar,
  tags: ["autodocs"],
  args: {
    onClear: () => {},
    onSelectAll: () => {},
    onBulkExtend: () => {},
    onBulkTransfer: () => {},
  },
} satisfies Meta<typeof BulkActionsToolbar>

export default meta
type Story = StoryObj<typeof meta>

export const ZeroSelected: Story = {
  args: {
    selectedCount: 0,
    allSelected: false,
    canExtend: false,
    canTransfer: false,
  },
}

export const SomeSelected: Story = {
  args: {
    selectedCount: 3,
    allSelected: false,
    canExtend: true,
    canTransfer: true,
  },
}

export const AllSelected: Story = {
  args: {
    selectedCount: 12,
    allSelected: true,
    canExtend: true,
    canTransfer: true,
  },
}

export const CanExtendOnly: Story = {
  args: {
    selectedCount: 2,
    allSelected: false,
    canExtend: true,
    canTransfer: false,
  },
}

export const CanTransferOnly: Story = {
  args: {
    selectedCount: 2,
    allSelected: false,
    canExtend: false,
    canTransfer: true,
  },
}
