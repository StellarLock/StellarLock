import type { Meta, StoryObj } from "@storybook/react"
import { expect, userEvent, waitFor, within } from "@storybook/test"
import { OnboardingTour } from "./OnboardingTour"
import { startOnboardingTour } from "./startOnboardingTour"

const STORAGE_KEY = "stellarlock:onboarding_tour_completed"

function TourCanvas({ showReplay }: { showReplay?: boolean }) {
  return (
    <div className="min-h-[360px] rounded-lg border border-border bg-secondary/20 p-6">
      <h1 className="text-lg font-semibold">StellarLock dashboard</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        The application remains usable while the onboarding coach mark is open.
      </p>
      {showReplay && (
        <button
          type="button"
          className="mt-6 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary"
          onClick={() => startOnboardingTour()}
        >
          Replay onboarding tour
        </button>
      )}
      <OnboardingTour />
    </div>
  )
}

const meta = {
  title: "Onboarding/OnboardingTour",
  component: OnboardingTour,
  tags: ["autodocs"],
} satisfies Meta<typeof OnboardingTour>

export default meta
type Story = StoryObj<typeof meta>

export const FirstVisit: Story = {
  render: () => {
    localStorage.removeItem(STORAGE_KEY)
    return <TourCanvas />
  },
}

export const CompletedVisit: Story = {
  render: () => {
    localStorage.setItem(STORAGE_KEY, "1")
    return <TourCanvas />
  },
}

export const Replayable: Story = {
  render: () => {
    localStorage.setItem(STORAGE_KEY, "1")
    return <TourCanvas showReplay />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: /replay onboarding tour/i }))
    await waitFor(() => expect(canvas.getByRole("dialog", { name: /onboarding tour/i })).toBeVisible())
  },
}

export const FinalStep: Story = {
  render: () => {
    localStorage.removeItem(STORAGE_KEY)
    return <TourCanvas />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByRole("dialog", { name: /onboarding tour/i })).toBeVisible())
    const next = canvas.getByRole("button", { name: "Next" })
    await userEvent.click(next)
    await userEvent.click(next)
    await userEvent.click(next)
  },
}
