import type { Meta, StoryObj } from "@storybook/react-vite"
import { CountdownTimer } from "./CountdownTimer"

const DAY = 86_400_000

const meta = {
  title: "UI/CountdownTimer",
  component: CountdownTimer,
  tags: ["autodocs"],
} satisfies Meta<typeof CountdownTimer>

export default meta
type Story = StoryObj<typeof meta>

export const DaysRemaining: Story = {
  args: { target: Date.now() + 45 * DAY },
}

export const HoursRemaining: Story = {
  args: { target: Date.now() + 3 * 3_600_000 },
}

export const Compact: Story = {
  args: { target: Date.now() + 5 * DAY, compact: true },
}

export const Unlocked: Story = {
  args: { target: Date.now() - DAY },
}
