import type { Meta, StoryObj } from "@storybook/react-vite"
import { StatusBadge } from "./StatusBadge"

const meta = {
  title: "UI/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof StatusBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Locked: Story = { args: { status: "locked" } }
export const Unlockable: Story = { args: { status: "unlockable" } }
export const Withdrawn: Story = { args: { status: "withdrawn" } }

export const AllStatuses: Story = {
  args: { status: "locked" },
  render: () => (
    <div className="flex gap-2">
      <StatusBadge status="locked" />
      <StatusBadge status="unlockable" />
      <StatusBadge status="withdrawn" />
    </div>
  ),
}
