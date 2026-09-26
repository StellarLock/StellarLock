import { useRef } from "react"
import { useModalFocusTrap } from "@/lib/modalFocusTrap"
import { BookUser, Plus, Pencil, Trash2, Check, X, Download, Upload, Search } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input, Label } from "@/components/ui/Input"
import { shortAddress } from "@/lib/utils"
import { isValidStellarAddress } from "@/lib/stellar-address"
import { type AddressBookEntry } from "@/hooks/useAddressBook"
import { useAddressBookUI } from "@/hooks/useAddressBookUI"
import { createPortal } from "react-dom"

interface AddressBookModalProps {
  /** When provided, shows a "Select" button and calls this on selection. */
  onSelect?: (entry: AddressBookEntry) => void
  onClose: () => void
}

export function AddressBookModal({ onSelect, onClose }: AddressBookModalProps) {
  const ui = useAddressBookUI()
  const importRef = useRef<HTMLInputElement>(null)
  const firstFocusRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useModalFocusTrap({ active: true, containerRef, initialFocusRef: firstFocusRef, onEscape: onClose })

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Address Book"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={containerRef} className="flex w-full max-w-lg flex-col rounded-xl bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <BookUser className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Address Book</h2>
            <span className="ms-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
              {ui.allEntries.length}
            </span>
          </div>
          <button
            ref={firstFocusRef}
            onClick={onClose}
            aria-label="Close address book"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + actions */}
        <div className="flex items-center gap-2 px-6 py-3">
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search addresses…"
              value={ui.search}
              onChange={(e) => ui.setSearch(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background ps-9 pe-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button variant="outline" size="sm" onClick={ui.handleExport} title="Export address book">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()} title="Import address book">
            <Upload className="h-4 w-4" />
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={ui.handleImportFile}
          />
          <Button
            size="sm"
            onClick={ui.toggleAddMode}
            title="Add address"
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {ui.importError && (
          <p className="mx-6 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{ui.importError}</p>
        )}

        {/* Add form */}
        {ui.addMode && (
          <div className="mx-6 mb-3 rounded-lg border border-border bg-secondary/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="ab-new-label">Label</Label>
                <Input
                  id="ab-new-label"
                  placeholder="e.g. Team Wallet"
                  value={ui.newLabel}
                  onChange={(e) => ui.setNewLabel(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="ab-new-address">Stellar Address</Label>
                <Input
                  id="ab-new-address"
                  placeholder="G… or C…"
                  value={ui.newAddress}
                  onChange={(e) => ui.setNewAddress(e.target.value)}
                  className={
                    ui.newAddress && !isValidStellarAddress(ui.newAddress) ? "border-destructive focus:ring-destructive" : ""
                  }
                />
              </div>
            </div>
            {ui.error && <p className="mt-2 text-xs text-destructive">{ui.error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={ui.handleAddCancel}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={ui.handleAdd}>
                <Check className="h-4 w-4" />
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Entry list */}
        <div className="max-h-80 overflow-y-auto px-6 pb-6">
          {ui.filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {ui.allEntries.length === 0
                ? "No saved addresses yet. Click Add to save your first address."
                : "No addresses match your search."}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {ui.filtered.map((entry) => (
                <li key={entry.id} className="py-3">
                  {ui.editId === entry.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`ab-edit-label-${entry.id}`}>Label</Label>
                        <Input
                          id={`ab-edit-label-${entry.id}`}
                          value={ui.editLabel}
                          onChange={(e) => ui.setEditLabel(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label htmlFor={`ab-edit-addr-${entry.id}`}>Address</Label>
                        <Input
                          id={`ab-edit-addr-${entry.id}`}
                          value={ui.editAddress}
                          onChange={(e) => ui.setEditAddress(e.target.value)}
                          className={
                            ui.editAddress && !isValidStellarAddress(ui.editAddress)
                              ? "border-destructive focus:ring-destructive"
                              : ""
                          }
                        />
                      </div>
                      {ui.error && <p className="col-span-2 text-xs text-destructive">{ui.error}</p>}
                      <div className="col-span-2 flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={ui.handleEditCancel}>
                          Cancel
                        </Button>
                        <Button size="sm" onClick={ui.handleEditSave}>
                          <Check className="h-4 w-4" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{shortAddress(entry.address, 8, 8)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {onSelect && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              onSelect(entry)
                              onClose()
                            }}
                          >
                            Select
                          </Button>
                        )}
                        <button
                          onClick={() => ui.handleEditStart(entry)}
                          aria-label={`Edit ${entry.label}`}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => ui.remove(entry.id)}
                          aria-label={`Delete ${entry.label}`}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
