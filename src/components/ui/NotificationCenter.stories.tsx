import type { Meta, StoryObj } from "@storybook/react"
import { userEvent, within } from "@storybook/test"
import { MemoryRouter } from "react-router-dom"
import { resetNotificationStore, type Notification } from "@/hooks/useNotifications"
import { NotificationCenter } from "./NotificationCenter"

const STORAGE_KEY = "stellarlock:notification_history"
type NotificationFixture = Omit<Notification, "timestamp">

const notifications: NotificationFixture[] = [
  {
    id: "notification-created",
    type: "lock_created",
    lockId: "42",
    lockKind: "token",
    title: "Lock created",
    message: "Your XLM tokens have been locked successfully.",
    read: false,
  },
  {
    id: "notification-unlocked",
    type: "lock_unlocked",
    lockId: "17",
    lockKind: "lp",
    title: "Lock unlocked",
    message: "Your liquidity lock is ready to withdraw.",
    read: false,
  },
  {
    id: "notification-extended",
    type: "lock_extended",
    lockId: "42",
    lockKind: "token",
    title: "Lock extended",
    message: "The unlock date for your token lock has been extended.",
    read: false,
  },
]

const meta = {
  title: "UI/NotificationCenter",
  component: NotificationCenter,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    // Each docs story needs its own module-level notification store.
    docs: { story: { inline: false, height: "520px" } },
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="flex justify-end p-4" style={{ width: "448px", minHeight: "520px" }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  beforeEach: ({ parameters }) => {
    const previous = localStorage.getItem(STORAGE_KEY)
    const fixtures = (parameters.notifications as NotificationFixture[] | undefined) ?? []
    const now = Date.now()
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(fixtures.map((notification, index) => ({ ...notification, timestamp: now - index * 3_600_000 }))),
    )
    resetNotificationStore()

    return () => {
      if (previous === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, previous)
      resetNotificationStore()
    }
  },
} satisfies Meta<typeof NotificationCenter>

export default meta
type Story = StoryObj<typeof meta>

const openNotifications: Story["play"] = async ({ canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Notifications" }))
}

/** The bell before the notification dropdown is opened. */
export const Default: Story = {}

/** No activity has been recorded yet. */
export const Empty: Story = {
  play: openNotifications,
}

/** Unread activity shows a count badge and the mark-all-as-read action. */
export const Unread: Story = {
  parameters: { notifications },
  play: openNotifications,
}

/** Previously read activity remains available in the history. */
export const AllRead: Story = {
  parameters: { notifications: notifications.map((notification) => ({ ...notification, read: true })) },
  play: openNotifications,
}

/** A history containing both read and unread notifications. */
export const Mixed: Story = {
  parameters: { notifications: notifications.map((notification, index) => ({ ...notification, read: index > 0 })) },
  play: openNotifications,
}

/** More than nine unread entries cap the badge at 9+ and scroll the history. */
export const ManyUnread: Story = {
  parameters: {
    notifications: Array.from({ length: 12 }, (_, index) => ({
      ...notifications[index % notifications.length],
      id: `notification-${index}`,
      lockId: String(index + 1),
    })),
  },
  play: openNotifications,
}
