import type { Meta, StoryObj } from "@storybook/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { I18nextProvider } from "react-i18next"
import i18n from "@/i18n"
import { Breadcrumbs } from "./Breadcrumbs"

const meta = {
  title: "Layout/Breadcrumbs",
  component: Breadcrumbs,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <Story />
      </I18nextProvider>
    ),
  ],
} satisfies Meta<typeof Breadcrumbs>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Wrap <Breadcrumbs /> in a router that resolves the same route patterns
 * the app uses (token lock detail, LP lock detail, discover), so the
 * component can read `useLocation`/`useParams` the same way it does in-app.
 */
function BreadcrumbsAt({ path }: { path: string }) {
  return (
    <div className="max-w-6xl">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/lock/token/:id" element={<Breadcrumbs />} />
          <Route path="/app/lock/lp/:id" element={<Breadcrumbs />} />
          <Route path="/explore/:token" element={<Breadcrumbs />} />
          <Route path="*" element={<Breadcrumbs />} />
        </Routes>
      </MemoryRouter>
    </div>
  )
}

/** Shallow path: token lock detail → Home > My Locks > Lock #:id */
export const TokenLockDetail: Story = {
  render: () => <BreadcrumbsAt path="/app/lock/token/42" />,
}

/** Deep-ish path: LP lock detail carries the same 3-level breadcrumb. */
export const LpLockDetail: Story = {
  render: () => <BreadcrumbsAt path="/app/lock/lp/7" />,
}

/** Discover route with a long token address → the address is shortened. */
export const ExploreShortenedToken: Story = {
  render: () => <BreadcrumbsAt path="/explore/GA1234567890ABCDEFGHIJKL" />,
}

/** Discover route with a short token address → shown in full. */
export const ExploreShortToken: Story = {
  render: () => <BreadcrumbsAt path="/explore/abc" />,
}

/** Top-level routes render no breadcrumbs at all. */
export const NoBreadcrumbsOnTopLevelRoutes: Story = {
  render: () => <BreadcrumbsAt path="/app/locks" />,
}