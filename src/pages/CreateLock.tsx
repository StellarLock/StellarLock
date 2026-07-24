import { useState } from "react"
import { Coins, Droplets } from "lucide-react"
import { Helmet } from "react-helmet-async"
import { useTranslation } from "react-i18next"
import { ConnectGate } from "@/components/layout/ConnectGate"
import { Card } from "@/components/ui/Card"
import { CreateTokenLockForm } from "@/components/locks/CreateTokenLockForm"
import { CreateLpLockForm } from "@/components/locks/CreateLpLockForm"
import { cn } from "@/lib/utils"

type Tab = "token" | "lp"

export function CreateLock() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>("token")

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Helmet>
        <title>Create a Lock | StellarLock</title>
        <meta
          name="description"
          content="Lock tokens or LP positions in an immutable Soroban smart contract on Stellar."
        />
      </Helmet>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">{t("createLock.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("createLock.subtitle")}</p>
      </div>

      <ConnectGate title={t("connectGate.title")}>
        <div
          role="tablist"
          aria-label={t("createLock.title")}
          className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-1"
        >
          <TabButton
            active={tab === "token"}
            onClick={() => setTab("token")}
            icon={<Coins className="h-4 w-4" />}
            controlsId="panel-token"
          >
            {t("createLock.tabToken")}
          </TabButton>
          <TabButton
            active={tab === "lp"}
            onClick={() => setTab("lp")}
            icon={<Droplets className="h-4 w-4" />}
            controlsId="panel-lp"
          >
            {t("createLock.tabLp")}
          </TabButton>
        </div>

        <Card
          className="p-6"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-label={tab === "token" ? t("createLock.tabToken") : t("createLock.tabLp")}
        >
          {tab === "token" ? <CreateTokenLockForm /> : <CreateLpLockForm />}
        </Card>
      </ConnectGate>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
  controlsId,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
  controlsId: string
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      aria-controls={controlsId}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  )
}
