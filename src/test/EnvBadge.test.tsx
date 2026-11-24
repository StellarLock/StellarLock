import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

// Mock ENV so the component never touches real env vars or the validation at
// the top of env.ts.  Each test that needs different values calls vi.mocked()
// directly.
vi.mock("@/lib/env", () => ({
  ENV: {
    showEnvBadge: true,
    isDev: true,
    network: "testnet",
  },
}))

import { ENV } from "@/lib/env"
import { EnvBadge } from "@/components/ui/EnvBadge"

describe("EnvBadge", () => {
  it("renders the 'dev' label when isDev is true", () => {
    Object.assign(ENV, { showEnvBadge: true, isDev: true, network: "testnet" })
    render(<EnvBadge />)
    expect(screen.getByText("dev")).toBeInTheDocument()
  })

  it("has the correct accessible aria-label in dev mode", () => {
    Object.assign(ENV, { showEnvBadge: true, isDev: true, network: "testnet" })
    render(<EnvBadge />)
    expect(screen.getByLabelText("Environment: dev")).toBeInTheDocument()
  })

  it("applies sky (blue) colour classes in dev mode", () => {
    Object.assign(ENV, { showEnvBadge: true, isDev: true, network: "testnet" })
    render(<EnvBadge />)
    const badge = screen.getByText("dev")
    expect(badge.className).toContain("bg-sky-500/20")
    expect(badge.className).toContain("text-sky-400")
  })

  it("renders the network name and amber classes when not dev (staging)", () => {
    Object.assign(ENV, { showEnvBadge: true, isDev: false, network: "staging" })
    render(<EnvBadge />)
    const badge = screen.getByText("staging")
    expect(badge).toBeInTheDocument()
    expect(badge.className).toContain("bg-amber-500/20")
    expect(badge.className).toContain("text-amber-400")
  })

  it("has the correct aria-label in staging mode", () => {
    Object.assign(ENV, { showEnvBadge: true, isDev: false, network: "staging" })
    render(<EnvBadge />)
    expect(screen.getByLabelText("Environment: staging")).toBeInTheDocument()
  })

  it("renders nothing when showEnvBadge is false (production)", () => {
    Object.assign(ENV, { showEnvBadge: false, isDev: false, network: "mainnet" })
    const { container } = render(<EnvBadge />)
    expect(container.firstChild).toBeNull()
  })
})
