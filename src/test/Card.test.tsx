import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ComponentType, HTMLAttributes } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card"

const parts: [string, ComponentType<HTMLAttributes<HTMLElement>>, string][] = [
  ["Card", Card, "rounded-xl"],
  ["CardHeader", CardHeader, "p-5"],
  ["CardTitle", CardTitle, "font-semibold"],
  ["CardDescription", CardDescription, "text-muted-foreground"],
  ["CardContent", CardContent, "pt-0"],
  ["CardFooter", CardFooter, "items-center"],
]

describe("Card", () => {
  it.each(parts)("%s renders its children", (name, Component) => {
    render(<Component>{`${name} child`}</Component>)

    expect(screen.getByText(`${name} child`)).toBeInTheDocument()
  })

  it.each(parts)("%s merges a custom className with its base classes", (name, Component, baseClass) => {
    render(<Component className="custom-class">{name}</Component>)

    expect(screen.getByText(name)).toHaveClass("custom-class", baseClass)
  })

  it("renders CardTitle as a heading", () => {
    render(<CardTitle>Lock details</CardTitle>)

    expect(screen.getByRole("heading", { name: "Lock details" })).toBeInTheDocument()
  })

  it("composes the sub-components together", () => {
    render(
      <Card data-testid="card">
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )

    const card = screen.getByTestId("card")
    for (const text of ["Title", "Description", "Content", "Footer"]) {
      expect(card).toContainElement(screen.getByText(text))
    }
  })
})
