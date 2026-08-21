import type { Meta, StoryObj } from "@storybook/react"
import { I18nextProvider } from "react-i18next"
import { HelmetProvider } from "react-helmet-async"
import { BrowserRouter } from "react-router-dom"
import { WalletProvider } from "@/hooks/useWallet"
import { AnnouncerProvider } from "@/hooks/useAnnouncer"
import i18n from "@/i18n"
import { ConnectGate } from "./ConnectGate"

const meta = {
  title: "Layout/ConnectGate",
  component: ConnectGate,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <HelmetProvider>
        <I18nextProvider i18n={i18n}>
          <BrowserRouter>
            <AnnouncerProvider>
              <WalletProvider>
                <Story />
              </WalletProvider>
            </AnnouncerProvider>
          </BrowserRouter>
        </I18nextProvider>
      </HelmetProvider>
    ),
  ],
} satisfies Meta<typeof ConnectGate>

export default meta
type Story = StoryObj<typeof meta>

/** Default (disconnected) state — prompts the user to connect their wallet. */
export const Disconnected: Story = {
  args: {
    children: <p className="text-sm text-muted-foreground">This content is gated until the wallet connects.</p>,
  },
}

/** Custom title passed via props. */
export const CustomTitle: Story = {
  args: {
    title: "Connect to manage your locks",
    children: <p className="text-sm text-muted-foreground">Gated content behind a custom heading.</p>,
  },
}