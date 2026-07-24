import type { Meta, StoryObj } from "@storybook/react-vite"
import { Lock } from "lucide-react"
import { Button } from "./Button"

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "outline", "ghost", "destructive"] },
    size: { control: "select", options: ["sm", "md", "lg", "icon"] },
  },
  args: { children: "Lock tokens" },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = { args: { variant: "primary" } }
export const Secondary: Story = { args: { variant: "secondary" } }
export const Outline: Story = { args: { variant: "outline" } }
export const Ghost: Story = { args: { variant: "ghost" } }
export const Destructive: Story = { args: { variant: "destructive", children: "Delete lock" } }

export const Loading: Story = { args: { variant: "primary", loading: true } }
export const Disabled: Story = { args: { variant: "primary", disabled: true } }

export const WithIcon: Story = {
  args: {
    variant: "primary",
    children: (
      <>
        <Lock className="h-4 w-4" />
        Lock tokens
      </>
    ),
  },
}

export const Sizes: Story = {
  args: { variant: "primary" },
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Lock">
        <Lock className="h-4 w-4" />
      </Button>
    </div>
  ),
}
