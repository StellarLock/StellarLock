import type { Meta, StoryObj } from "@storybook/react"
import { PageSkeleton } from "./PageSkeleton"

const meta = {
  title: "UI/PageSkeleton",
  component: PageSkeleton,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    viewport: {
      viewports: {
        mobile: {
          name: "Mobile",
          styles: { width: "375px", height: "812px" },
        },
        desktop: {
          name: "Desktop",
          styles: { width: "1280px", height: "800px" },
        },
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PageSkeleton>

export default meta
type Story = StoryObj<typeof meta>

/** The page loading placeholder with pulsing heading, subtitle, and cards. */
export const Default: Story = {}

/** Cards stack in one column on small screens. */
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile" } },
}

/** Cards form a two-column grid within the page's maximum width on larger screens. */
export const Desktop: Story = {
  parameters: { viewport: { defaultViewport: "desktop" } },
}
