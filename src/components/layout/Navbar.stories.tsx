import type { Meta, StoryObj } from "@storybook/react"
import { BrowserRouter } from "react-router-dom"
import { Navbar } from "./Navbar"

const meta = {
  title: "Layout/Navbar",
  component: Navbar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
} satisfies Meta<typeof Navbar>

export default meta
type Story = StoryObj<typeof meta>

export const Connected: Story = {
  parameters: {
    // Mock the wallet state as connected
    walletState: {
      isConnected: true,
      address: "GBUQWP3BOUZX34ULNQG23RQ6F4V4UYXDEYK3Z77ADJUSTEDWAL",
      connecting: false,
    },
  },
  decorators: [
    (Story) => {
      // For now, render the default state
      // In a real implementation, you would mock useWallet hook
      return <Story />
    },
  ],
}

export const Disconnected: Story = {
  parameters: {
    // Mock the wallet state as disconnected
    walletState: {
      isConnected: false,
      address: undefined,
      connecting: false,
    },
  },
  decorators: [
    (Story) => {
      // For now, render the default state
      // In a real implementation, you would mock useWallet hook
      return <Story />
    },
  ],
}

export const Connecting: Story = {
  parameters: {
    // Mock the wallet state as connecting
    walletState: {
      isConnected: false,
      address: undefined,
      connecting: true,
      connectState: "connecting",
    },
  },
  decorators: [
    (Story) => {
      // For now, render the default state
      // In a real implementation, you would mock useWallet hook
      return <Story />
    },
  ],
}
