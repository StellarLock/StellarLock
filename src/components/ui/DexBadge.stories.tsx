import type { Meta, StoryObj } from "@storybook/react-vite"
import { DexBadge } from "./DexBadge"

const meta = {
  title: "UI/DexBadge",
  component: DexBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof DexBadge>

export default meta
type Story = StoryObj<typeof meta>

export const Aquarius: Story = { args: { dex: "aquarius" } }
export const Soroswap: Story = { args: { dex: "soroswap" } }

export const Both: Story = {
  args: { dex: "aquarius" },
  render: () => (
    <div className="flex gap-2">
      <DexBadge dex="aquarius" />
      <DexBadge dex="soroswap" />
    </div>
  ),
}
