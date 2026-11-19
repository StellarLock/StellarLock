import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { HelmetProvider } from "react-helmet-async"
import { NotFound } from "@/pages/NotFound"

function renderNotFound(path = "/does-not-exist") {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[path]}>
        <NotFound />
      </MemoryRouter>
    </HelmetProvider>,
  )
}

describe("NotFound", () => {
  it("renders the not-found message", () => {
    renderNotFound()

    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Page Not Found" })).toBeInTheDocument()
    expect(screen.getByText("The page you're looking for doesn't exist or may have been moved.")).toBeInTheDocument()
    expect(screen.getByText("/does-not-exist")).toBeInTheDocument()
  })

  it("links back to the home page", () => {
    renderNotFound()

    const homeLink = screen.getByRole("link", { name: /Back to Home/ })
    expect(homeLink).toHaveAttribute("href", "/")
  })
})
