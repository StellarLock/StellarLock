import type { Meta, StoryObj } from "@storybook/react"
import { TokenAvatar } from "./TokenAvatar"

const meta = {
  title: "UI/TokenAvatar",
  component: TokenAvatar,
  tags: ["autodocs"],
} satisfies Meta<typeof TokenAvatar>

export default meta
type Story = StoryObj<typeof meta>

export const Small: Story = { args: { symbol: "GLOW", size: "sm" } }
export const Medium: Story = { args: { symbol: "GLOW", size: "md" } }
export const Large: Story = { args: { symbol: "GLOW", size: "lg" } }

export const DifferentSymbols: Story = {
  args: { symbol: "GLOW" },
  render: () => (
    <div className="flex items-center gap-3">
      <TokenAvatar symbol="XLM" />
      <TokenAvatar symbol="USDC" />
      <TokenAvatar symbol="AQUA" />
      <TokenAvatar symbol="soroswap" />
    </div>
  ),
}
