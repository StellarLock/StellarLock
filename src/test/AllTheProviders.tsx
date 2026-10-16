import { BrowserRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { WalletProvider } from "@/hooks/useWallet"
import { AnnouncerProvider } from "@/hooks/useAnnouncer"

export const AllTheProviders = ({ children }: { children: React.ReactNode }) => (
  <HelmetProvider>
    <I18nextProvider i18n={i18n}>
      <BrowserRouter>
        <AnnouncerProvider>
          <WalletProvider>{children}</WalletProvider>
        </AnnouncerProvider>
      </BrowserRouter>
    </I18nextProvider>
  </HelmetProvider>
)
