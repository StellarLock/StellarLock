import type { Meta, StoryObj } from "@storybook/react"
import { NotificationSettings } from "./NotificationSettings"

const meta = {
  title: "Locks/NotificationSettings",
  component: NotificationSettings,
  tags: ["autodocs"],
} satisfies Meta<typeof NotificationSettings>

export default meta
type Story = StoryObj<typeof meta>

const unlockAt = Date.now() + 90 * 24 * 60 * 60 * 1000 // 90 days from now

export const DefaultPreferences: Story = {
  args: {
    lockId: "lock-1",
    unlockAt,
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDWAL",
  },
}

export const BrowserNotificationsEnabled: Story = {
  args: {
    lockId: "lock-2",
    unlockAt,
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDWAL",
  },
}

export const WithoutWallet: Story = {
  args: {
    lockId: "lock-3",
    unlockAt,
    address: undefined,
  },
}

export const AlreadyUnlocked: Story = {
  args: {
    lockId: "lock-4",
    unlockAt: Date.now() - 1000, // Already unlocked
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDWAL",
  },
  parameters: {
    docs: {
      description: {
        story: "When unlock time is in the past, the component does not render (returns null).",
      },
    },
  },
}

export const ShortTimeUntilUnlock: Story = {
  args: {
    lockId: "lock-5",
    unlockAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours from now
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDWAL",
  },
}
