import type { Meta, StoryObj } from "@storybook/react"
import { Button } from "./Button"

const meta = {
  title: "UI/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "outline", "ghost", "destructive"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
    disabled: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {
  args: {
    children: "Primary Button",
    variant: "primary",
  },
}

export const Outline: Story = {
  args: {
    children: "Outline Button",
    variant: "outline",
  },
}

export const Ghost: Story = {
  args: {
    children: "Ghost Button",
    variant: "ghost",
  },
}

export const Destructive: Story = {
  args: {
    children: "Destructive Button",
    variant: "destructive",
  },
}

export const Small: Story = {
  args: {
    children: "Small Button",
    size: "sm",
  },
}

export const Large: Story = {
  args: {
    children: "Large Button",
    size: "lg",
  },
}

export const Disabled: Story = {
  args: {
    children: "Disabled Button",
    disabled: true,
  },
}

export const Loading: Story = {
  args: {
    children: "Loading",
    disabled: true,
  },
}
