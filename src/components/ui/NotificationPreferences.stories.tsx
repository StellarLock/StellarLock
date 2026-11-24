import type { Meta, StoryObj } from "@storybook/react"
import type { NotificationPrefs } from "@/hooks/useNotifications"
import { NotificationPreferences } from "./NotificationPreferences"

const STORAGE_KEY = "stellarlock:notification_prefs"
const defaultPrefs: NotificationPrefs = {
  browser: false,
  types: {
    lock_created: true,
    lock_unlocked: true,
    lock_withdrawn: true,
    lock_extended: true,
    unlock_reminder: true,
    beneficiary_transfer: true,
    unlock_approaching: true,
  },
}

const meta = {
  title: "UI/NotificationPreferences",
  component: NotificationPreferences,
  tags: ["autodocs"],
  argTypes: {
    lockId: { control: "text" },
  },
  parameters: {
    layout: "centered",
    docs: { story: { inline: false, height: "900px" } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: "480px", maxWidth: "100%" }}>
        <Story />
      </div>
    ),
  ],
  beforeEach: ({ args, parameters }) => {
    const previous = localStorage.getItem(STORAGE_KEY)
    const preferences = (parameters.preferences as NotificationPrefs | undefined) ?? defaultPrefs
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [args.lockId ?? "global"]: { ...preferences, lockId: args.lockId } }),
    )

    return () => {
      if (previous === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, previous)
    }
  },
} satisfies Meta<typeof NotificationPreferences>

export default meta
type Story = StoryObj<typeof meta>

/** Global defaults: all notification types enabled, with no delivery integrations. */
export const Default: Story = {}

/** Browser notifications enabled for a lock, without requesting permission on render. */
export const BrowserEnabled: Story = {
  args: { lockId: "storybook-lock-42" },
  parameters: { preferences: { ...defaultPrefs, browser: true } },
}

/** A lock with a configured webhook delivery endpoint. */
export const WithWebhook: Story = {
  args: { lockId: "storybook-lock-42" },
  parameters: {
    preferences: { ...defaultPrefs, webhookUrl: "https://example.com/webhooks/stellarlock" },
  },
}

/** Optional notifications disabled; the required types remain enabled and non-editable. */
export const RequiredOnly: Story = {
  args: { lockId: "storybook-lock-42" },
  parameters: {
    preferences: {
      ...defaultPrefs,
      types: {
        ...defaultPrefs.types,
        lock_withdrawn: false,
        lock_extended: false,
        unlock_reminder: false,
        unlock_approaching: false,
      },
    },
  },
}

/** Lock-specific preferences with both integrations and a custom selection of types. */
export const PerLock: Story = {
  args: { lockId: "storybook-lock-17" },
  parameters: {
    preferences: {
      ...defaultPrefs,
      browser: true,
      webhookUrl: "https://example.com/webhooks/lock-17",
      types: { ...defaultPrefs.types, lock_extended: false, unlock_reminder: false },
    },
  },
}
