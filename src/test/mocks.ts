import { vi } from "vitest"

export const VALID_PUBLIC_KEY = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
export const VALID_CONTRACT_ADDRESS = "CBFCKEOQRQIXKLGU4QBUQVOINOKFBOXJ37LXEKLKNUO6TW4FNGDU26AW"

export const mockWallet = {
  address: VALID_PUBLIC_KEY,
  isConnected: true,
  connecting: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  signTransaction: vi.fn().mockResolvedValue({
    signedTxXdr: "AAAAAgAAAAB7D4kmWHhYN8LD0gCTiROgXqrwOlZqvGH7JcYYvEL8AAAAZAA4IjAAAAABAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAA",
  }),
}

export const mockLock = {
  id: "1",
  kind: "token" as const,
  status: "locked" as const,
  token: {
    address: VALID_CONTRACT_ADDRESS,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  creator: VALID_PUBLIC_KEY,
  beneficiary: VALID_PUBLIC_KEY,
  amount: 1000,
  usdValue: 1000,
  createdAt: Date.now() - 86400000,
  unlockAt: Date.now() + 86400000 * 30,
  extendedCount: 0,
}

export const mockLpLock = {
  ...mockLock,
  id: "2",
  kind: "lp" as const,
  dex: "aquarius" as const,
  poolPair: [VALID_CONTRACT_ADDRESS, "native"],
}

export function mockFetch(responses: Record<string, Response>) {
  return vi.fn((url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k))
    if (key) {
      return Promise.resolve(responses[key])
    }
    return Promise.reject(new Error(`No mock for ${url}`))
  })
}

export function mockSuccessResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

export function mockErrorResponse(status = 500) {
  return new Response(null, { status })
}

export const mockRpcResponse = {
  getLedger: () => mockSuccessResponse({ ledger_sequence: 12345 }),
  getBalance: () => mockSuccessResponse({ amount: "1000.0000000" }),
  submitTransaction: () => mockSuccessResponse({ hash: "abc123" }),
  getContractData: () => mockSuccessResponse({
    xdr: "AAAAAgo=",
  }),
}
