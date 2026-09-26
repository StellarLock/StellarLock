import { useState } from "react"
import { isValidStellarAddress } from "@/lib/stellar-address"
import { useAddressBook, type AddressBookEntry } from "./useAddressBook"

export function useAddressBookUI() {
  const book = useAddressBook()
  const [search, setSearch] = useState("")
  const [editId, setEditId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [editAddress, setEditAddress] = useState("")
  const [addMode, setAddMode] = useState(false)
  const [newLabel, setNewLabel] = useState("")
  const [newAddress, setNewAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const filtered = book.entries.filter(
    (e) =>
      e.label.toLowerCase().includes(search.toLowerCase()) || e.address.toLowerCase().includes(search.toLowerCase()),
  )

  function handleAdd() {
    setError(null)
    if (!newLabel.trim()) return setError("Label is required.")
    if (!isValidStellarAddress(newAddress.trim())) return setError("Invalid Stellar address.")
    book.add(newLabel, newAddress)
    setNewLabel("")
    setNewAddress("")
    setAddMode(false)
  }

  function handleEditSave() {
    if (!editId) return
    setError(null)
    if (!editLabel.trim()) return setError("Label is required.")
    if (!isValidStellarAddress(editAddress.trim())) return setError("Invalid Stellar address.")
    book.update(editId, editLabel, editAddress)
    setEditId(null)
  }

  function handleEditStart(entry: AddressBookEntry) {
    setEditId(entry.id)
    setEditLabel(entry.label)
    setEditAddress(entry.address)
    setError(null)
    setAddMode(false)
  }

  function handleEditCancel() {
    setEditId(null)
    setError(null)
  }

  function handleAddCancel() {
    setAddMode(false)
    setError(null)
  }

  function handleExport() {
    const json = book.exportJson()
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "stellarlock-address-book.json"
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const result = book.importJson(text)
      if (result.errors > 0 && result.imported === 0) {
        setImportError("Import failed: no valid entries found.")
      } else if (result.errors > 0 && result.imported > 0) {
        setImportError(
          `Imported ${result.imported} ${result.imported === 1 ? "address" : "addresses"}, skipped ${result.errors} invalid ${result.errors === 1 ? "entry" : "entries"}.`,
        )
      } else if (result.imported > 0) {
        setImportError(null)
      }
    }
    reader.readAsText(file)
    // Reset so the same file can be re-imported
    e.target.value = ""
  }

  function toggleAddMode() {
    setAddMode((v) => !v)
    setEditId(null)
    setError(null)
  }

  return {
    // State
    search,
    editId,
    editLabel,
    editAddress,
    addMode,
    newLabel,
    newAddress,
    error,
    importError,
    filtered,
    allEntries: book.entries,

    // Setters
    setSearch,
    setEditLabel,
    setEditAddress,
    setNewLabel,
    setNewAddress,

    // Handlers
    handleAdd,
    handleEditSave,
    handleEditStart,
    handleEditCancel,
    handleAddCancel,
    handleExport,
    handleImportFile,
    toggleAddMode,

    // Book operations
    remove: book.remove,
  }
}
