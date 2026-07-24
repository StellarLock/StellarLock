import type { Meta, StoryObj } from "@storybook/react"
import { HealthPage } from "./Health"

const meta: Meta<typeof HealthPage> = {
  title: "Pages/Health",
  component: HealthPage,
}

export default meta

type Story = StoryObj<typeof HealthPage>

export const Default: Story = {}
