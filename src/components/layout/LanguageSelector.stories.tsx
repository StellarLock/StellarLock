import type { Meta, StoryObj } from "@storybook/react"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { LanguageSelector } from "./LanguageSelector"

const meta = {
  title: "Layout/LanguageSelector",
  component: LanguageSelector,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div className="flex min-h-[200px] items-start justify-end p-4">
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
} satisfies Meta<typeof LanguageSelector>

export default meta
type Story = StoryObj<typeof meta>

/** Default closed state — the globe button is visible, the dropdown is not. */
export const Closed: Story = {
  args: {},
}

/**
 * Open state — the dropdown menu is visible. Achieved via the `play` function
 * which simulates clicking the toggle button.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    // Find the toggle button and click it to open the menu
    const button = canvasElement.querySelector(
      'button[aria-label="Select language"]',
    ) as HTMLButtonElement | null
    if (button) {
      button.click()
    }
  },
}