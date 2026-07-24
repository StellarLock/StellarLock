import type { Meta, StoryObj } from "@storybook/react"
import { Layers } from "lucide-react"
import { StatCard } from "./StatCard"

const meta = {
  title: "UI/StatCard",
  component: StatCard,
  tags: ["autodocs"],
} satisfies Meta<typeof StatCard>

export default meta
type Story = StoryObj<typeof meta>

export const Basic: Story = {
  args: { label: "Locks Created", value: "12" },
}

export const WithIcon: Story = {
  args: { label: "Locks Created", value: "12", icon: <Layers className="h-4 w-4" /> },
}

export const WithHint: Story = {
  args: {
    label: "Ready to Withdraw",
    value: "3",
    hint: "Action available",
  },
}

export const LargeValue: Story = {
  args: { label: "Total Value Locked", value: "$4.2M" },
}
