import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  createVerifyToken,
  hashVerifyToken,
  lockPath,
  lockUrl,
  unsubscribeToken,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from "./mailer"

describe("lockPath / lockUrl", () => {
  it("maps token lock ids to /app/lock/token/<id>", () => {
    expect(lockPath("token:1000")).toBe("/app/lock/token/1000")
  })

  it("maps LP lock ids to /app/lock/lp/<id>", () => {
    expect(lockPath("lp:7")).toBe("/app/lock/lp/7")
  })

  it("treats bare numeric ids as token locks", () => {
    expect(lockPath("42")).toBe("/app/lock/token/42")
  })

  it("prefixes the app base URL", () => {
    expect(lockUrl("lp:3")).toMatch(/^https?:\/\/[^/]+\/app\/lock\/lp\/3$/)
  })
})

describe("unsubscribe tokens", () => {
  beforeEach(() => {
    process.env.NOTIFICATION_LINK_SECRET = "test-secret"
  })
  afterEach(() => {
    delete process.env.NOTIFICATION_LINK_SECRET
  })

  it("accepts the token it issued", () => {
    expect(verifyUnsubscribeToken("sub-1", unsubscribeToken("sub-1"))).toBe(true)
  })

  it("rejects a token for a different subscription", () => {
    expect(verifyUnsubscribeToken("sub-2", unsubscribeToken("sub-1"))).toBe(false)
  })

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken("sub-1", "abc")).toBe(false)
  })

  it("rejects everything when no secret is configured", () => {
    const token = unsubscribeToken("sub-1")
    delete process.env.NOTIFICATION_LINK_SECRET
    expect(verifyUnsubscribeToken("sub-1", token)).toBe(false)
  })

  it("builds an unsubscribe URL carrying id and token", () => {
    const url = new URL(unsubscribeUrl("sub-1"))
    expect(url.pathname).toBe("/api/notifications/unsubscribe-email")
    expect(url.searchParams.get("id")).toBe("sub-1")
    expect(url.searchParams.get("token")).toBe(unsubscribeToken("sub-1"))
  })
})

describe("verify tokens", () => {
  it("creates a random token whose hash matches", () => {
    const a = createVerifyToken()
    const b = createVerifyToken()
    expect(a.token).toMatch(/^[0-9a-f]{64}$/)
    expect(a.token).not.toBe(b.token)
    expect(a.hash).toBe(hashVerifyToken(a.token))
    expect(a.hash).not.toBe(a.token)
  })
})
