import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getTokenMetadata, clearTokenMetadataCache } from "@/lib/token-metadata"

const CONTRACT_ID = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75"
const ASSET_ID = "USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN-1"
const REAL_LOGO_URL = "https://stellar.myfilebase.com/ipfs/QmXPqPAv3oRiQFehNB8Lw25DLuDz8irZwpfU7e6hPsr2qS"

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

describe("getTokenMetadata", () => {
  beforeEach(() => {
    clearTokenMetadataCache()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearTokenMetadataCache()
  })

  it("hits the real stellar.expert API domain, not the dead api.stellarexpert.com host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false))
    vi.stubGlobal("fetch", fetchMock)

    await getTokenMetadata(CONTRACT_ID)

    const calledUrls = fetchMock.mock.calls.map((call) => urlOf(call[0] as RequestInfo | URL))
    expect(calledUrls.length).toBeGreaterThan(0)
    for (const url of calledUrls) {
      expect(url).not.toContain("api.stellarexpert.com")
      expect(url.startsWith("https://api.stellar.expert/") || url.startsWith("https://stellar.expert/")).toBe(
        true,
      )
    }
  })

  it("resolves a real logo URL distinct from the monogram fallback when the API returns one", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input)
      if (url.includes(`/contract/${CONTRACT_ID}`)) {
        return jsonResponse({ contract: CONTRACT_ID, asset: ASSET_ID })
      }
      if (url.includes(`/asset/${ASSET_ID}`)) {
        return jsonResponse({
          asset: ASSET_ID,
          code: "USDC",
          home_domain: "circle.com",
          toml_info: {
            code: "USDC",
            issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
            image: REAL_LOGO_URL,
            orgName: "Circle Internet Financial, LLC",
          },
        })
      }
      throw new Error(`Unexpected fetch to ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const metadata = await getTokenMetadata(CONTRACT_ID)

    expect(metadata.logo).toBe(REAL_LOGO_URL)
    expect(metadata.symbol).toBe("USDC")
    expect(metadata.verified).toBe(true)
    // A regression to a dead endpoint would produce this instead - assert we
    // are on the "real logo" path, not silently degraded to fallback.
    expect(metadata.logo).not.toBeUndefined()
  })

  it("falls back to the monogram path (no logo) when the API call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false))
    vi.stubGlobal("fetch", fetchMock)

    const metadata = await getTokenMetadata(CONTRACT_ID)

    expect(metadata.logo).toBeUndefined()
    expect(metadata.symbol).toBe("")
  })

  it("falls back to the monogram path when the contract has no backing classic asset", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = urlOf(input)
      if (url.includes(`/contract/${CONTRACT_ID}`)) {
        return jsonResponse({ contract: CONTRACT_ID })
      }
      throw new Error(`Unexpected fetch to ${url}`)
    })
    vi.stubGlobal("fetch", fetchMock)

    const metadata = await getTokenMetadata(CONTRACT_ID)

    expect(metadata.logo).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
