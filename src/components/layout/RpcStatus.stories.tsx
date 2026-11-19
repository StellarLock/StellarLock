import { useEffect, useMemo } from "react"
import type { Meta, StoryObj } from "@storybook/react"
import { RpcStatusBanner, RpcStatusIndicator } from "./RpcStatus"

type RpcScenario = "connected" | "slow" | "disconnected"

const nativeFetch = window.fetch

function RpcScenario({ scenario }: { scenario: RpcScenario }) {
  const mockedFetch = useMemo((): typeof window.fetch => {
    return async () => {
      if (scenario === "disconnected") {
        throw new Error("Stellar RPC is unreachable")
      }

      if (scenario === "slow") {
        await new Promise((resolve) => window.setTimeout(resolve, 1700))
      }

      return new Response(null, { status: 200 })
    }
  }, [scenario])

  // Patch fetch during render so useRpcHealth observes the scenario on mount;
  // restore the browser implementation when the story is removed.
  window.fetch = mockedFetch
  useEffect(() => {
    return () => {
      window.fetch = nativeFetch
    }
  }, [mockedFetch])

  return (
    <div className="w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-sm font-medium">RPC connection</p>
          <p className="text-xs text-muted-foreground">Live status indicator</p>
        </div>
        <RpcStatusIndicator />
      </div>
      <RpcStatusBanner />
    </div>
  )
}

const meta = {
  title: "Layout/RpcStatus",
  component: RpcStatusIndicator,
  tags: ["autodocs"],
} satisfies Meta<typeof RpcStatusIndicator>

export default meta
type Story = StoryObj<typeof meta>

export const Connected: Story = {
  render: () => <RpcScenario scenario="connected" />,
}

export const Slow: Story = {
  render: () => <RpcScenario scenario="slow" />,
}

export const Disconnected: Story = {
  render: () => <RpcScenario scenario="disconnected" />,
}
