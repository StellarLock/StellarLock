import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { Tabs, type TabItem } from "./Tabs"

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

const items: TabItem[] = [
  { value: "created", label: "Created by me", count: 4 },
  { value: "received", label: "Beneficiary", count: 0 },
]

function ControlledTabs({ initial, tabs }: { initial: string; tabs: TabItem[] }) {
  const [value, setValue] = useState(initial)
  return <Tabs items={tabs} value={value} onChange={setValue} />
}

export const FirstTabActive: Story = {
  args: { items, value: "created", onChange: () => {} },
  render: () => <ControlledTabs initial="created" tabs={items} />,
}

export const SecondTabActive: Story = {
  args: { items, value: "received", onChange: () => {} },
  render: () => <ControlledTabs initial="received" tabs={items} />,
}

export const WithoutCounts: Story = {
  args: { items, value: "token", onChange: () => {} },
  render: () => (
    <ControlledTabs
      initial="token"
      tabs={[
        { value: "token", label: "Token Lock" },
        { value: "lp", label: "LP Lock" },
      ]}
    />
  ),
}
