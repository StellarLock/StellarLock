import type { Meta, StoryObj } from "@storybook/react"
import { I18nextProvider } from "react-i18next"
import { BrowserRouter } from "react-router-dom"
import i18n from "@/i18n"
import { WalletProvider } from "@/hooks/useWallet"
import { WalletAlerts } from "./WalletAlerts"

const meta = {
  title: "Layout/WalletAlerts",
  component: WalletAlerts,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <I18nextProvider i18n={i18n}>
          <WalletProvider>
            <div className="min-h-screen bg-background p-4">
              <Story />
            </div>
          </WalletProvider>
        </I18nextProvider>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof WalletAlerts>

export default meta
type Story = StoryObj<typeof meta>

export const NoAlert: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        No alerts are shown when the wallet is properly connected
      </p>
      <WalletAlerts />
      <div className="mt-8 rounded-lg border border-border p-4">
        <p className="text-sm font-medium">Wallet Status: Connected ✓</p>
        <p className="text-xs text-muted-foreground">No disconnection or network change alerts active</p>
      </div>
    </div>
  ),
}

export const DisconnectAlert: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Shows a destructive alert when wallet becomes disconnected
      </p>
      <p className="text-xs font-mono bg-muted p-2 rounded">
        Typically appears when the user disconnects from their wallet
      </p>
      <div className="fixed top-4 end-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive shadow-lg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-5 w-5 shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="flex-1">
          <p className="font-medium">Wallet Disconnected</p>
          <p className="text-xs opacity-90">Your wallet connection was lost. Please reconnect.</p>
        </div>
        <button className="shrink-0 hover:opacity-80" aria-label="Dismiss">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  ),
}

export const NetworkAlert: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Shows a warning alert when the network was changed
      </p>
      <p className="text-xs font-mono bg-muted p-2 rounded">
        Appears when the user switches from the expected network
      </p>
      <div className="fixed top-4 end-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-700 shadow-lg">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mt-0.5 h-5 w-5 shrink-0"
        >
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
        </svg>
        <div className="flex-1">
          <p className="font-medium">Network Changed</p>
          <p className="text-xs opacity-90">You switched to a different network. Please verify your network.</p>
        </div>
        <button className="shrink-0 hover:opacity-80" aria-label="Dismiss">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  ),
}

export const BothAlerts: Story = {
  render: () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        When both conditions occur, both alerts may appear (stacking behavior)
      </p>
      <p className="text-xs font-mono bg-muted p-2 rounded">
        In practice, alerts are dismissed individually or navigation happens automatically after 3 seconds
      </p>
      <div className="space-y-3 fixed top-4 end-4 z-50">
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-5 w-5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <p className="font-medium">Wallet Disconnected</p>
            <p className="text-xs opacity-90">Your wallet connection was lost.</p>
          </div>
          <button className="shrink-0 hover:opacity-80">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-700 shadow-lg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-0.5 h-5 w-5 shrink-0"
          >
            <circle cx="12" cy="12" r="2" />
            <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
          </svg>
          <div className="flex-1">
            <p className="font-medium">Network Changed</p>
            <p className="text-xs opacity-90">You switched to a different network.</p>
          </div>
          <button className="shrink-0 hover:opacity-80">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  ),
}
