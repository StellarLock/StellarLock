import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import { render } from "./utils"
import { TxErrorAlert } from "@/components/ui/TxErrorAlert"
import type { StructuredError } from "@/lib/errors"

// Mock the WalletProvider used by the render utility to avoid @stellar/freighter-api
vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(),
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("TxErrorAlert", () => {
  it("should render nothing when error is null", () => {
    const { container } = render(<TxErrorAlert error={null} />)
    // The render wrapper (AnnouncerProvider) may add live-region elements,
    // so assert that no TxErrorAlert markup (border-destructive alert box) is present
    expect(container.querySelector(".border-destructive")).toBeNull()
  })

  it("should render the error title and message", () => {
    const error: StructuredError = {
      code: "AmountMustBePositive",
      title: "errors.amountMustBePositive.title",
      message: "errors.amountMustBePositive.message",
      recovery: null,
      link: null,
      i18nKey: "errors.amountMustBePositive",
    }

    render(<TxErrorAlert error={error} />)

    expect(screen.getByText("Invalid Amount")).toBeInTheDocument()
    expect(screen.getByText("Lock amount must be greater than zero.")).toBeInTheDocument()
  })

  it("should render a recovery suggestion when provided", () => {
    const error: StructuredError = {
      code: "AmountMustBePositive",
      title: "errors.amountMustBePositive.title",
      message: "errors.amountMustBePositive.message",
      recovery: "errors.amountMustBePositive.recovery",
      link: null,
      i18nKey: "errors.amountMustBePositive",
    }

    render(<TxErrorAlert error={error} />)

    expect(screen.getByText("Invalid Amount")).toBeInTheDocument()
    expect(screen.getByText("Lock amount must be greater than zero.")).toBeInTheDocument()
    expect(screen.getByText("Enter a positive amount to continue.")).toBeInTheDocument()
  })

  it("should render a link when provided", () => {
    const error: StructuredError = {
      code: "TestError",
      title: "Test Error Title",
      message: "Test error message",
      recovery: null,
      link: { label: "Get help", url: "https://docs.stellarlock.com/help" },
      i18nKey: "errors.test",
    }

    render(<TxErrorAlert error={error} />)

    const link = screen.getByRole("link", { name: /get help/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute("href", "https://docs.stellarlock.com/help")
    expect(link).toHaveAttribute("target", "_blank")
  })

  it("should apply custom className when provided", () => {
    const error: StructuredError = {
      code: "AmountMustBePositive",
      title: "errors.amountMustBePositive.title",
      message: "errors.amountMustBePositive.message",
      recovery: null,
      link: null,
      i18nKey: "errors.amountMustBePositive",
    }

    const { container } = render(<TxErrorAlert error={error} className="custom-class" />)
    const alert = container.firstChild as HTMLElement
    expect(alert.className).toContain("custom-class")
  })

  it("should have role=alert for accessibility", () => {
    const error: StructuredError = {
      code: "StillLocked",
      title: "errors.stillLocked.title",
      message: "errors.stillLocked.message",
      recovery: "errors.stillLocked.recovery",
      link: null,
      i18nKey: "errors.stillLocked",
    }

    const { container } = render(<TxErrorAlert error={error} />)

    // AnnouncerProvider also renders a visually-hidden role="alert" live region,
    // so scope the assertion to the actual alert container
    const alerts = container.querySelectorAll('[role="alert"]')
    const alert = Array.from(alerts).find((el) => el.className.includes("border-destructive"))
    expect(alert).toBeInTheDocument()
    expect(alert!.className).toContain("rounded-lg")
  })

  it("should render the AlertTriangle icon", () => {
    const error: StructuredError = {
      code: "AmountMustBePositive",
      title: "errors.amountMustBePositive.title",
      message: "errors.amountMustBePositive.message",
      recovery: null,
      link: null,
      i18nKey: "errors.amountMustBePositive",
    }

    render(<TxErrorAlert error={error} />)

    const svg = document.querySelector("svg")
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })
})