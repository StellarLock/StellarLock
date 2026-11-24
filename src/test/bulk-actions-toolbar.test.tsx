import { describe, it, expect, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { render } from "./utils"
import { BulkActionsToolbar } from "@/components/locks/BulkActionsToolbar"

vi.mock("@/hooks/useWallet", () => ({
  useWallet: vi.fn(() => ({ isConnected: false, connecting: false, connect: vi.fn() })),
  WalletProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const defaultProps = {
  selectedCount: 0,
  onClear: vi.fn(),
  onSelectAll: vi.fn(),
  allSelected: false,
  onBulkExtend: vi.fn(),
  onBulkTransfer: vi.fn(),
  canExtend: true,
  canTransfer: true,
}

describe("BulkActionsToolbar Component", () => {
  it("shows 'Select all' when nothing is selected", () => {
    render(<BulkActionsToolbar {...defaultProps} />)

    expect(screen.getByText("Select all")).toBeInTheDocument()
  })

  it("shows the selected count when items are selected", () => {
    render(<BulkActionsToolbar {...defaultProps} selectedCount={3} />)

    expect(screen.getByText("3 selected")).toBeInTheDocument()
    expect(screen.queryByText("Select all")).not.toBeInTheDocument()
  })

  it("reflects the allSelected state on the checkbox", () => {
    const { rerender } = render(<BulkActionsToolbar {...defaultProps} allSelected={false} />)

    expect(screen.getByRole("checkbox", { name: /select all locks/i })).not.toBeChecked()

    rerender(<BulkActionsToolbar {...defaultProps} allSelected={true} />)

    expect(screen.getByRole("checkbox", { name: /select all locks/i })).toBeChecked()
  })

  it("calls onSelectAll when the checkbox is toggled", async () => {
    const user = userEvent.setup()
    const onSelectAll = vi.fn()

    render(<BulkActionsToolbar {...defaultProps} onSelectAll={onSelectAll} />)

    await user.click(screen.getByRole("checkbox", { name: /select all locks/i }))

    expect(onSelectAll).toHaveBeenCalledOnce()
  })

  it("calls onClear when the cancel button is clicked", async () => {
    const user = userEvent.setup()
    const onClear = vi.fn()

    render(<BulkActionsToolbar {...defaultProps} onClear={onClear} />)

    await user.click(screen.getByRole("button", { name: /cancel selection/i }))

    expect(onClear).toHaveBeenCalledOnce()
  })

  it("renders the extend and transfer actions when permitted", () => {
    render(<BulkActionsToolbar {...defaultProps} canExtend={true} canTransfer={true} />)

    expect(screen.getByRole("button", { name: /extend all/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /transfer all/i })).toBeInTheDocument()
  })

  it("hides the extend action when canExtend is false", () => {
    render(<BulkActionsToolbar {...defaultProps} canExtend={false} />)

    expect(screen.queryByRole("button", { name: /extend all/i })).not.toBeInTheDocument()
  })

  it("hides the transfer action when canTransfer is false", () => {
    render(<BulkActionsToolbar {...defaultProps} canTransfer={false} />)

    expect(screen.queryByRole("button", { name: /transfer all/i })).not.toBeInTheDocument()
  })

  it("disables the extend and transfer actions when nothing is selected", () => {
    render(<BulkActionsToolbar {...defaultProps} selectedCount={0} />)

    expect(screen.getByRole("button", { name: /extend all/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /transfer all/i })).toBeDisabled()
  })

  it("enables the extend and transfer actions once items are selected", () => {
    render(<BulkActionsToolbar {...defaultProps} selectedCount={2} />)

    expect(screen.getByRole("button", { name: /extend all/i })).toBeEnabled()
    expect(screen.getByRole("button", { name: /transfer all/i })).toBeEnabled()
  })

  it("calls onBulkExtend when the extend action is clicked", async () => {
    const user = userEvent.setup()
    const onBulkExtend = vi.fn()

    render(<BulkActionsToolbar {...defaultProps} selectedCount={2} onBulkExtend={onBulkExtend} />)

    await user.click(screen.getByRole("button", { name: /extend all/i }))

    expect(onBulkExtend).toHaveBeenCalledOnce()
  })

  it("calls onBulkTransfer when the transfer action is clicked", async () => {
    const user = userEvent.setup()
    const onBulkTransfer = vi.fn()

    render(<BulkActionsToolbar {...defaultProps} selectedCount={2} onBulkTransfer={onBulkTransfer} />)

    await user.click(screen.getByRole("button", { name: /transfer all/i }))

    expect(onBulkTransfer).toHaveBeenCalledOnce()
  })
})
