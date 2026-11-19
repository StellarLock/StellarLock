import type { Meta, StoryObj } from "@storybook/react"
import { userEvent, within } from "@storybook/test"
import { BrowserRouter } from "react-router-dom"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { ContractEventContext, type ContractEvent } from "@/hooks/useContractEventContext"
import { RecentActivity } from "./RecentActivity"

const meta = {
  title: "Discover/RecentActivity",
  component: RecentActivity,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <BrowserRouter>
          <div className="max-w-4xl">
            <Story />
          </div>
        </BrowserRouter>
      </I18nextProvider>
    ),
  ],
} satisfies Meta<typeof RecentActivity>

export default meta
type Story = StoryObj<typeof meta>

const creator = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const beneficiary = "GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
const usdc = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
const pool = "CDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD"

const contextFor = (events: ContractEvent[]) => ({
  events,
  addListener: () => undefined,
  removeListener: () => undefined,
})

function ActivityWithEvents({ events }: { events: ContractEvent[] }) {
  return (
    <ContractEventContext.Provider value={contextFor(events)}>
      <RecentActivity />
    </ContractEventContext.Provider>
  )
}

const now = Date.now()

const tokenEvents: ContractEvent[] = [
  {
    type: "lock_created",
    lockId: "1042",
    timestamp: now - 5 * 60 * 1000,
    data: {
      raw: {
        creator,
        token: usdc,
        amount: "12500",
        unlockAt: now + 90 * 24 * 60 * 60 * 1000,
      },
    },
  },
  {
    type: "beneficiary_transferred",
    lockId: "1038",
    timestamp: now - 25 * 60 * 1000,
    data: { raw: { beneficiary } },
  },
  {
    type: "lock_extended",
    lockId: "1031",
    timestamp: now - 60 * 60 * 1000,
    data: {
      raw: {
        creator,
        newUnlockAt: now + 180 * 24 * 60 * 60 * 1000,
      },
    },
  },
  {
    type: "lock_withdrawn",
    lockId: "1019",
    timestamp: now - 2 * 60 * 60 * 1000,
    data: { raw: { beneficiary, token: usdc, amount: "800" } },
  },
]

const mixedEvents: ContractEvent[] = [
  ...tokenEvents,
  {
    type: "lp_lock_created",
    lockId: "lp-27",
    timestamp: now - 3 * 60 * 1000,
    data: {
      raw: {
        creator,
        asset: pool,
        amount: 450,
        unlock_timestamp: now + 30 * 24 * 60 * 60 * 1000,
      },
    },
  },
  {
    type: "lp_lock_extended",
    lockId: "lp-21",
    timestamp: now - 40 * 60 * 1000,
    data: {
      raw: {
        from: creator,
        asset: pool,
        unlockAt: now + 365 * 24 * 60 * 60 * 1000,
      },
    },
  },
  {
    type: "lp_beneficiary_transferred",
    lockId: "lp-18",
    timestamp: now - 90 * 60 * 1000,
    data: { raw: { to: beneficiary } },
  },
]

export const Empty: Story = {
  render: () => <ActivityWithEvents events={[]} />,
}

export const LiveTokenActivity: Story = {
  render: () => <ActivityWithEvents events={tokenEvents} />,
}

export const MixedTokenAndLpActivity: Story = {
  render: () => <ActivityWithEvents events={mixedEvents} />,
}

export const Paused: Story = {
  render: () => <ActivityWithEvents events={mixedEvents} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: /pause/i }))
  },
}
