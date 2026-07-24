import type { Lock, TokenMeta } from "@/types/lock"

const DAY = 86_400_000
const now = Date.now()

export const TOKENS: Record<string, TokenMeta> = {
  GLOW: {
    address: "CGLOWXK7QJ2YF3VZ5R8N4M6P9TWD2ABCXYZ7KLMNOPQRSTUVWX1234",
    symbol: "GLOW",
    name: "Glowstone",
    decimals: 7,
  },
  NOVA: {
    address: "CNOVA8KQ2WERTY5UIOP3ASDFGH7JKLZXCVBNM4QWERT9YUIOP12345",
    symbol: "NOVA",
    name: "Nova Protocol",
    decimals: 7,
  },
  REEF: {
    address: "CREEF4ZXCVBNMASDFGHJKL2QWERTYUIOP9876543MNBVCXZ1QAZ2WS",
    symbol: "REEF",
    name: "Reef Finance",
    decimals: 7,
  },
  XLM: {
    address: "CXLMNATIVEWRAPPEDASSETCONTRACTADDRESS000000000000000000",
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
  },
  USDC: {
    address: "CUSDCCENTREASSETCONTRACTADDRESS1111111111111111111111111",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 7,
  },
}

const WALLET = "GBEXAMPLEUSERWALLETADDRESS7Q2WERTYUIOPASDFGHJKLZXCVBNM"

export const MOCK_LOCKS: Lock[] = [
  {
    id: "1042",
    kind: "token",
    status: "locked",
    token: TOKENS.GLOW,
    creator: WALLET,
    beneficiary: WALLET,
    amount: 12_500_000,
    usdValue: 487_500,
    createdAt: now - 40 * DAY,
    unlockAt: now + 320 * DAY,
    extendedCount: 1,
  },
  {
    id: "1043",
    kind: "lp",
    status: "locked",
    token: { ...TOKENS.GLOW, symbol: "GLOW-XLM LP", name: "GLOW/XLM Pool Share" },
    dex: "aquarius",
    poolPair: ["GLOW", "XLM"],
    creator: WALLET,
    beneficiary: WALLET,
    amount: 845_000,
    usdValue: 1_240_000,
    createdAt: now - 12 * DAY,
    unlockAt: now + 540 * DAY,
    extendedCount: 0,
  },
  {
    id: "0981",
    kind: "token",
    status: "locked",
    token: TOKENS.GLOW,
    creator: WALLET,
    beneficiary: "GTEAMVESTINGBENEFICIARY9ASDFGHJKLZXCVBNMQWERTYUIOP1234",
    amount: 6_000_000,
    usdValue: 234_000,
    createdAt: now - 90 * DAY,
    unlockAt: now + 90 * DAY,
    extendedCount: 2,
    vesting: { start: now - 90 * DAY, end: now + 270 * DAY, released: 1_500_000 },
  },
  {
    id: "1101",
    kind: "lp",
    status: "locked",
    token: { ...TOKENS.NOVA, symbol: "NOVA-USDC LP", name: "NOVA/USDC Pool Share" },
    dex: "soroswap",
    poolPair: ["NOVA", "USDC"],
    creator: "GNOVATEAMTREASURYADDRESS2WERTYUIOPASDFGHJKLZXCVBNMQ987",
    beneficiary: "GNOVATEAMTREASURYADDRESS2WERTYUIOPASDFGHJKLZXCVBNMQ987",
    amount: 2_100_000,
    usdValue: 3_780_000,
    createdAt: now - 5 * DAY,
    unlockAt: now + 730 * DAY,
    extendedCount: 0,
  },
  {
    id: "0777",
    kind: "token",
    status: "unlockable",
    token: TOKENS.REEF,
    creator: WALLET,
    beneficiary: WALLET,
    amount: 350_000,
    usdValue: 28_000,
    createdAt: now - 200 * DAY,
    unlockAt: now - 2 * DAY,
    extendedCount: 0,
  },
  {
    id: "0612",
    kind: "token",
    status: "withdrawn",
    token: TOKENS.REEF,
    creator: WALLET,
    beneficiary: WALLET,
    amount: 120_000,
    usdValue: 9_600,
    createdAt: now - 400 * DAY,
    unlockAt: now - 120 * DAY,
    extendedCount: 1,
  },
  {
    id: "1190",
    kind: "token",
    status: "locked",
    token: TOKENS.NOVA,
    creator: "GCOMMUNITYMEMBERADDR55WERTYUIOPASDFGHJKLZXCVBNMQ1234567",
    beneficiary: "GCOMMUNITYMEMBERADDR55WERTYUIOPASDFGHJKLZXCVBNMQ1234567",
    amount: 980_000,
    usdValue: 215_600,
    createdAt: now - 2 * DAY,
    unlockAt: now + 180 * DAY,
    extendedCount: 0,
  },
]

/** Resolve a token by address or symbol; used by the explorer search. */
export function findToken(query: string): TokenMeta | undefined {
  const q = query.trim().toLowerCase()
  return Object.values(TOKENS).find((t) => t.address.toLowerCase() === q || t.symbol.toLowerCase() === q)
}
