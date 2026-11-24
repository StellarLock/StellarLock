import type { Meta, StoryObj } from "@storybook/react"
import { BrowserRouter } from "react-router-dom"
import { Breadcrumbs } from "./Breadcrumbs"

const meta = {
  title: "Layout/Breadcrumbs",
  component: Breadcrumbs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <BrowserRouter>
        <Story />
      </BrowserRouter>
    ),
  ],
} satisfies Meta<typeof Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

export const ShallowPath: Story = {
  parameters: {
    reactRouter: {
      location: {
        pathname: "/app/locks",
      },
    },
  },
}

export const LockDetail: Story = {
  parameters: {
    reactRouter: {
      location: {
        pathname: "/app/lock/token/1042",
      },
      routeParams: {
        id: "1042",
      },
    },
  },
}

export const LockDetailWithTruncatedId: Story = {
  parameters: {
    reactRouter: {
      location: {
        pathname: "/app/lock/token/CGLOWXK7QJ2YF3VZ5R8N4M6P9TWD2ABCXYZ7KLMNOPQRSTUVWX1234",
      },
      routeParams: {
        id: "CGLOWXK7QJ2YF3VZ5R8N4M6P9TWD2ABCXYZ7KLMNOPQRSTUVWX1234",
      },
    },
  },
}

export const ExploreTokenDetail: Story = {
  parameters: {
    reactRouter: {
      location: {
        pathname: "/explore/CGLOWXK7QJ2YF3VZ5R8N4M6P9TWD2ABCXYZ7KLMNOPQRSTUVWX1234",
      },
      routeParams: {
        token: "CGLOWXK7QJ2YF3VZ5R8N4M6P9TWD2ABCXYZ7KLMNOPQRSTUVWX1234",
      },
    },
  },
}

export const HomePage: Story = {
  parameters: {
    reactRouter: {
      location: {
        pathname: "/",
      },
    },
  },
}
