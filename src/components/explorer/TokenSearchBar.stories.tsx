import type { Meta, StoryObj } from "@storybook/react"
import { BrowserRouter } from "react-router-dom"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { TokenSearchBar } from "./TokenSearchBar"

const meta = {
  title: "Explorer/TokenSearchBar",
  component: TokenSearchBar,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <I18nextProvider i18n={i18n}>
          <div className="w-full max-w-2xl">
            <Story />
          </div>
        </I18nextProvider>
      </BrowserRouter>
    ),
  ],
  parameters: {
    layout: "padded",
  },
  argTypes: {
    className: {
      control: "text",
    },
    autoFocus: {
      control: "boolean",
    },
  },
} satisfies Meta<typeof TokenSearchBar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    className: "",
    autoFocus: false,
  },
}

export const EmptyState: Story = {
  args: {
    className: "",
    autoFocus: false,
  },
  render: (args) => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Shows the search input in its initial empty state</p>
      <TokenSearchBar {...args} />
    </div>
  ),
}

export const WithAutoFocus: Story = {
  args: {
    className: "",
    autoFocus: true,
  },
  render: (args) => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Input field is focused automatically on load</p>
      <TokenSearchBar {...args} />
    </div>
  ),
}

export const WithCustomClass: Story = {
  args: {
    className: "max-w-md",
    autoFocus: false,
  },
  render: (args) => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Search bar with custom max-width styling</p>
      <TokenSearchBar {...args} />
    </div>
  ),
}

export const InContext: Story = {
  args: {
    className: "",
    autoFocus: false,
  },
  render: (args) => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Token SearchBar in a realistic context. Try typing to see:
      </p>
      <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
        <li>Verified token suggestions when typing token symbols or names</li>
        <li>Recent searches when the input is empty</li>
        <li>Arrow key navigation through suggestions</li>
      </ul>
      <div className="mt-6 rounded-lg bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold">Token Explorer</h3>
        <TokenSearchBar {...args} />
      </div>
    </div>
  ),
}
