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
    amount: 125_000_000n, // 12.5 GLOW at 7 decimals
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
    amount: 8_450_000n, // 0.845 LP at 7 decimals
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
    amount: 60_000_000n, // 6 GLOW at 7 decimals
    usdValue: 234_000,
    createdAt: now - 90 * DAY,
    unlockAt: now + 90 * DAY,
    extendedCount: 2,
    vesting: { start: now - 90 * DAY, end: now + 270 * DAY, released: 15_000_000n },
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
    amount: 21_000_000n, // 2.1 LP at 7 decimals
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
    amount: 3_500_000n, // 0.35 REEF at 7 decimals
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
    amount: 1_200_000n, // 0.12 REEF at 7 decimals
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
    amount: 9_800_000n, // 0.98 NOVA at 7 decimals
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
