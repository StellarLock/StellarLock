import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import type { ChangeEvent } from "react"
import { useAddressBookUI } from "@/hooks/useAddressBookUI"

const STORAGE_KEY = "stellarlock:address-book"
const ADDR_A = "GCFIRY65OQE7DFP5KLNS2PF2LVZMUZYJX4OZIEQ36N2IQANUB5XVYOJR"
const ADDR_B = "GCATS5YOVB6ROX2WUNKGNQ2MP3GMXDMKSG2O4N5CLX3A6W4PZGZZI55U"

function seed() {
  const now = Date.now()
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      { id: "1", label: "Team Wallet", address: ADDR_A, createdAt: now, updatedAt: now },
      { id: "2", label: "Treasury", address: ADDR_B, createdAt: now, updatedAt: now },
    ]),
  )
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

function fileChangeEvent(contents: string) {
  const file = new File([contents], "book.json", { type: "application/json" })
  return { target: { files: [file], value: "book.json" } } as unknown as ChangeEvent<HTMLInputElement>
}

describe("useAddressBookUI", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.assign(URL, { createObjectURL: originalCreateObjectURL, revokeObjectURL: originalRevokeObjectURL })
  })

  it("filters entries by label or address search text", () => {
    seed()
    const { result } = renderHook(() => useAddressBookUI())
    expect(result.current.filtered).toHaveLength(2)

    act(() => result.current.setSearch("treas"))
    expect(result.current.filtered.map((e) => e.label)).toEqual(["Treasury"])

    act(() => result.current.setSearch(ADDR_A.slice(0, 10).toLowerCase()))
    expect(result.current.filtered.map((e) => e.label)).toEqual(["Team Wallet"])

    act(() => result.current.setSearch("nothing-matches"))
    expect(result.current.filtered).toHaveLength(0)
    expect(result.current.allEntries).toHaveLength(2)
  })

  it("shows validation errors when adding an entry with a missing label or invalid address", () => {
    const { result } = renderHook(() => useAddressBookUI())

    act(() => result.current.toggleAddMode())
    act(() => result.current.setNewAddress(ADDR_A))
    act(() => result.current.handleAdd())
    expect(result.current.error).toBe("Label is required.")

    act(() => result.current.setNewLabel("Team Wallet"))
    act(() => result.current.setNewAddress("GNOTVALID"))
    act(() => result.current.handleAdd())
    expect(result.current.error).toBe("Invalid Stellar address.")
    expect(result.current.allEntries).toHaveLength(0)
    expect(result.current.addMode).toBe(true)
  })

  it("shows validation errors when saving an edit with a missing label or invalid address", () => {
    seed()
    const { result } = renderHook(() => useAddressBookUI())

    act(() => result.current.handleEditStart(result.current.allEntries[0]))
    act(() => result.current.setEditLabel("   "))
    act(() => result.current.handleEditSave())
    expect(result.current.error).toBe("Label is required.")

    act(() => result.current.setEditLabel("Renamed"))
    act(() => result.current.setEditAddress("not-an-address"))
    act(() => result.current.handleEditSave())
    expect(result.current.error).toBe("Invalid Stellar address.")
    expect(result.current.editId).toBe("1")
    expect(result.current.allEntries[0].label).toBe("Team Wallet")
  })

  it("exports the entries as a JSON blob download", async () => {
    seed()
    let exported: Blob | undefined
    const createObjectURL = vi.fn((blob: Blob) => {
      exported = blob
      return "blob:mock"
    })
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})

    const { result } = renderHook(() => useAddressBookUI())
    act(() => result.current.handleExport())

    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock")
    expect(exported?.type).toBe("application/json")

    const parsed = JSON.parse(await readBlob(exported!))
    expect(parsed).toEqual(result.current.allEntries)
    expect(parsed.map((e: { address: string }) => e.address)).toEqual([ADDR_A, ADDR_B])
  })

  it("surfaces an error when importing invalid JSON", async () => {
    const { result } = renderHook(() => useAddressBookUI())

    act(() => result.current.handleImportFile(fileChangeEvent("{ not valid json")))

    await waitFor(() => expect(result.current.importError).toBe("Import failed: no valid entries found."))
    expect(result.current.allEntries).toHaveLength(0)
  })
})
