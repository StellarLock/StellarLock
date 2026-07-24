import type { Meta, StoryObj } from "@storybook/react"
import { LockProgressBar } from "./LockProgressBar"

const DAY = 86_400_000

const meta = {
  title: "UI/LockProgressBar",
  component: LockProgressBar,
  tags: ["autodocs"],
} satisfies Meta<typeof LockProgressBar>

export default meta
type Story = StoryObj<typeof meta>

export const JustStarted: Story = {
  args: { createdAt: Date.now() - 1 * DAY, unlockAt: Date.now() + 89 * DAY },
}

export const HalfwayThere: Story = {
  args: { createdAt: Date.now() - 45 * DAY, unlockAt: Date.now() + 45 * DAY },
}

export const NearlyDone: Story = {
  args: { createdAt: Date.now() - 85 * DAY, unlockAt: Date.now() + 5 * DAY },
}

export const ReadyToWithdraw: Story = {
  args: { createdAt: Date.now() - 90 * DAY, unlockAt: Date.now() - 1 * DAY },
}

export const WithoutLabel: Story = {
  args: { createdAt: Date.now() - 45 * DAY, unlockAt: Date.now() + 45 * DAY, showLabel: false },
}
