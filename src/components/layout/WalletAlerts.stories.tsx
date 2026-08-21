import type { ReactNode } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { I18nextProvider, useTranslation } from "react-i18next"
import { HelmetProvider } from "react-helmet-async"
import { BrowserRouter } from "react-router-dom"
import { Wifi, X } from "lucide-react"
import { WalletProvider } from "@/hooks/useWallet"
import { AnnouncerProvider } from "@/hooks/useAnnouncer"
import i18n from "@/i18n"
import { WalletAlerts } from "./WalletAlerts"

const i18nDecorator = (Story: () => ReactNode) => (
  <I18nextProvider i18n={i18n}>
    <Story />
  </I18nextProvider>
)

const fullProviderDecorator = (Story: () => ReactNode) => (
  <HelmetProvider>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <AnnouncerProvider>
          <WalletProvider>
            <div className="relative min-h-[200px]">
              <Story />
            </div>
          </WalletProvider>
        </AnnouncerProvider>
      </BrowserRouter>
    </I18nextProvider>
  </HelmetProvider>
)

const meta = {
  title: "Layout/WalletAlerts",
  component: WalletAlerts,
  tags: ["autodocs"],
  decorators: [fullProviderDecorator],
} satisfies Meta<typeof WalletAlerts>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Hidden state — with no wallet connected and no network mismatch, the
 * component renders nothing (it returns an empty fragment).
 */
export const NoAlerts: Story = {
  args: {},
}

/**
 * Wrong-network alert — a faithful, isolated render of the banner shown
 * when `networkChanged` is true, using the app's own i18n strings.
 * The `networkChanged` flag lives inside the non-exported wallet context
 * and cannot be flipped from outside, so the banner is composed inline
 * with the same markup/classes the component uses.
 */
export const WrongNetworkAlert: Story = {
  decorators: [i18nDecorator],
  render: () => {
    const Preview = () => {
      const { t } = useTranslation()
      return (
        <div className="fixed top-4 end-4 z-50 flex max-w-md items-start gap-3 rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm text-yellow-700 shadow-lg">
          <Wifi className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{t("wallet.networkChanged")}</p>
            <p className="text-xs opacity-90">{t("wallet.networkChangedDesc")}</p>
          </div>
          <button type="button" className="shrink-0 hover:opacity-80" aria-label={t("common.dismiss")}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )
    }
    return <Preview />
  },
}