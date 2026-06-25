import { vi } from "vitest"

export const mockWallet = {
  address: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMXQMGJGH3ZLNDU2TCAEUZX3",
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
    address: "CBVOBNRDOMUMERKKXKYY3NHE4HHE4AQIZVMWUNUZKXNQPQHCSIKUBVJZ",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  creator: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMXQMGJGH3ZLNDU2TCAEUZX3",
  beneficiary: "GBRPYHIL2CI3WHZDTOOQFC6EB4KJJGUJMXQMGJGH3ZLNDU2TCAEUZX3",
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
  poolPair: ["CBVOBNRDOMUMERKKXKYY3NHE4HHE4AQIZVMWUNUZKXNQPQHCSIKUBVJZ", "native"],
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
