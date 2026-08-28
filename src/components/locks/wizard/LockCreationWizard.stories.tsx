import type { Meta, StoryObj } from "@storybook/react"
import { BrowserRouter } from "react-router-dom"
import { WalletProvider } from "@/hooks/useWallet"
import { LockCreationWizard } from "./LockCreationWizard"

const meta = {
  title: "Locks/LockCreationWizard",
  component: LockCreationWizard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <WalletProvider>
          <Story />
        </WalletProvider>
      </BrowserRouter>
    ),
  ],
} satisfies Meta<typeof LockCreationWizard>

export default meta
type Story = StoryObj<typeof meta>

export const TokenLockStep1: Story = {}

export const LpLockStep1: Story = {
  play: ({ canvasElement }) => {
    const buttons = Array.from(canvasElement.querySelectorAll("button"))
    const lpButton = buttons.find((button) => button.textContent?.includes("LP Lock"))
    lpButton?.click()
  },
}
