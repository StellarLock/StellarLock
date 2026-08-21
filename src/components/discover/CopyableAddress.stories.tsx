import type { Meta, StoryObj } from "@storybook/react"
import { CopyableAddress } from "./CopyableAddress"

const meta = {
  title: "Discover/CopyableAddress",
  component: CopyableAddress,
  tags: ["autodocs"],
  argTypes: {
    address: {
      control: "text",
    },
    className: {
      control: "text",
    },
  },
} satisfies Meta<typeof CopyableAddress>

export default meta
type Story = StoryObj<typeof meta>

const LONG_ADDRESS = "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDBEN"

export const Default: Story = {
  args: {
    address: LONG_ADDRESS,
  },
}

export const ShortAddress: Story = {
  args: {
    address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77",
  },
}

export const WithCustomClass: Story = {
  args: {
    address: LONG_ADDRESS,
    className: "text-primary text-sm",
  },
}
