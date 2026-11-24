import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"
import { createServer, type IncomingHttpHeaders, type Server } from "node:http"
import { lookup as dnsLookup } from "node:dns"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddressInfo } from "node:net"

// The test webhook server lives on loopback, which the real SSRF guard blocks.
// `allowLoopback` swaps in a permissive guard so dispatch behaviour (redirect
// handling) can be exercised; with it off, the real connect-time check runs.
const guard = vi.hoisted(() => ({ allowLoopback: false }))
vi.mock("./ssrf", async (importOriginal) => {
  const real = await importOriginal<typeof import("./ssrf")>()
  return {
    ...real,
    // Pretend subscribe-time/dispatch-time resolution passed; this isolates
    // the connect-time check below (simulating DNS changing in between).
    validateWebhookUrl: vi.fn(() => Promise.resolve(null)),
    safeLookup: ((host, opts, cb) =>
      guard.allowLoopback ? dnsLookup(host, opts, cb) : real.safeLookup(host, opts, cb)) as typeof real.safeLookup,
  }
})

const tmpDir = mkdtempSync(join(tmpdir(), "notifier-test-"))
process.env.LOCK_INDEX_DB_PATH = join(tmpDir, "notifier.sqlite")
// sendEmail() short-circuits when RESEND_API_KEY is empty. A non-empty value
// here lets the email-link test exercise the Resend request path through a
// stubbed global fetch. The existing webhook-only tests are unaffected
// because their subscriptions carry no email address.
const previousResendKey = process.env.RESEND_API_KEY
process.env.RESEND_API_KEY = "test-key"
// Read by the notifier at import time.
process.env.WEBHOOK_SECRET = "test-webhook-secret"
process.env.RESEND_API_KEY = "test-resend-key"
const { db, initDb } = await import("./db")
const { runNotifier, dueTier } = await import("./notifier")

const hits: string[] = []
const deliveries: { headers: IncomingHttpHeaders; body: string }[] = []
let server: Server
let port: number

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "")
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk: string) => (body += chunk))
    req.on("end", () => {
      deliveries.push({ headers: req.headers, body })
      if (req.url === "/hook") {
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/internal` }).end()
      } else {
        res.writeHead(200).end()
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
  port = (server.address() as AddressInfo).port
  initDb()
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  db.close()
  rmSync(tmpDir, { recursive: true, force: true })
  process.env.RESEND_API_KEY = previousResendKey
})

beforeEach(() => {
  hits.length = 0
  deliveries.length = 0
  db.exec("DELETE FROM notification_subscriptions; DELETE FROM locks;")
  const now = Math.floor(Date.now() / 1000)
  db.prepare(
    `INSERT INTO locks (id, kind, creator, beneficiary, token, amount, unlock_at, status, created_at)
     VALUES ('token:1', 'token', 'GC', 'GB', 'GT', '100', ?, 'locked', ?)`,
  ).run(now - 10, now - 1000)
  db.prepare(
    `INSERT INTO notification_subscriptions (id, lock_id, address, webhook_url)
     VALUES ('s1', 'token:1', 'GA', ?)`,
  ).run(`http://localhost:${port}/hook`)
})

describe("runNotifier webhook dispatch", () => {
  it("does not follow redirects from the webhook endpoint", async () => {
    guard.allowLoopback = true
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await runNotifier()
    // A single POST (only the most specific due tier), not following the 302.
    expect(hits).toEqual(["/hook"])
    expect(errSpy.mock.calls.some((c) => /redirect 302 — not followed/.test(String(c[0])))).toBe(true)
    errSpy.mockRestore()
  })

  it("refuses to connect when the hostname resolves to a private address at dispatch time", async () => {
    guard.allowLoopback = false
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    await runNotifier()
    expect(hits).toEqual([])
    expect(
      errSpy.mock.calls.some(
        (c) => String(c[1] ?? "").includes("ESSRFBLOCKED") || /refusing to connect/.test(String(c[1])),
      ),
    ).toBe(true)
    errSpy.mockRestore()
  })
})

describe("runNotifier reminder tiers", () => {
  it("subscribing within 1 day of unlock still sends the 7d and 1d reminders in one run", async () => {
    guard.allowLoopback = true
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const now = Math.floor(Date.now() / 1000)
    // 12h away: both the 7d and 1d windows are crossed; 0d is not (future).
    db.prepare("UPDATE locks SET unlock_at = ? WHERE id = 'token:1'").run(now + 12 * 3600)

    await runNotifier()

    // A late subscriber still catches every reminder whose window has already
    // passed, in a single dispatch run.
    expect(hits.length).toBe(2)
    errSpy.mockRestore()
  })

  it("does not re-send the 7d reminder for a lock extended back into the 7-day window", async () => {
    guard.allowLoopback = true
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const now = Math.floor(Date.now() / 1000)
    // The 7d reminder already fired; the lock was then extended to 5 days out.
    db.prepare("UPDATE locks SET unlock_at = ? WHERE id = 'token:1'").run(now + 5 * 86_400)
    db.prepare("UPDATE notification_subscriptions SET reminded_7d = 1 WHERE id = 's1'").run()

    await runNotifier()

    // 7d stays suppressed (flag is set); 5d is outside the 1d/0d windows.
    expect(hits).toEqual([])
    errSpy.mockRestore()
  })

  it("does not dispatch further reminders for a withdrawn lock that already received its unlock reminder", async () => {
    guard.allowLoopback = true
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const now = Math.floor(Date.now() / 1000)
    // Lock unlocked, withdrawn, and every reminder already sent.
    db.prepare("UPDATE locks SET status = 'withdrawn', withdrawn = 1, unlock_at = ? WHERE id = 'token:1'")
      .run(now - 10)
    db.prepare(
      "UPDATE notification_subscriptions SET reminded_7d = 1, reminded_1d = 1, reminded_0d = 1 WHERE id = 's1'",
    ).run()

    await runNotifier()

    // reminded_0d = 1 filters the subscription out of the scan entirely.
    expect(hits).toEqual([])
    errSpy.mockRestore()
  })

  it("a second run over the same window dispatches no duplicate reminders", async () => {
    guard.allowLoopback = true
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await runNotifier() // first pass: 7d + 1d + 0d
    expect(hits.length).toBe(3)
    hits.length = 0

    await runNotifier() // second pass: all flags set → nothing due
    expect(hits).toEqual([])
    errSpy.mockRestore()
describe("webhook signing (#1119)", () => {
  it("sends a timestamp and delivery id and signs `timestamp.payload`", async () => {
    guard.allowLoopback = true
    db.prepare(`UPDATE notification_subscriptions SET webhook_url = ? WHERE id = 's1'`).run(
      `http://localhost:${port}/ok`,
    )
    const before = Math.floor(Date.now() / 1000)
    await runNotifier()
    const after = Math.floor(Date.now() / 1000)

    expect(deliveries).toHaveLength(1)
    const { headers, body } = deliveries[0]
    const timestamp = Number(headers["x-stellarlock-timestamp"])
    const deliveryId = String(headers["x-stellarlock-delivery"])
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
    expect(deliveryId).toMatch(/^[0-9a-f-]{36}$/)

    const parsed = JSON.parse(body) as { timestamp: number; deliveryId: string }
    expect(parsed.timestamp).toBe(timestamp)
    expect(parsed.deliveryId).toBe(deliveryId)

    const expected = createHmac("sha256", "test-webhook-secret").update(`${timestamp}.${body}`).digest("hex")
    expect(headers["x-stellarlock-signature"]).toBe(expected)
    // A signature over the bare payload (the old, replayable scheme) no longer matches.
    const legacy = createHmac("sha256", "test-webhook-secret").update(body).digest("hex")
    expect(headers["x-stellarlock-signature"]).not.toBe(legacy)
  })
})

describe("reminder tier selection (#1118)", () => {
  const unlockAt = 10_000_000
  const fresh = { reminded_7d: 0, reminded_1d: 0, reminded_0d: 0 }

  it("returns only the most specific due tier", () => {
    expect(dueTier(fresh, { unlock_at: unlockAt }, unlockAt - 8 * 86_400)).toBeNull()
    expect(dueTier(fresh, { unlock_at: unlockAt }, unlockAt - 3 * 86_400)).toBe("7d")
    expect(dueTier(fresh, { unlock_at: unlockAt }, unlockAt - 2 * 3_600)).toBe("1d")
    expect(dueTier(fresh, { unlock_at: unlockAt }, unlockAt + 60)).toBe("0d")
  })

  it("returns nothing once the current tier has been sent", () => {
    const sent1d = { reminded_7d: 1, reminded_1d: 1, reminded_0d: 0 }
    expect(dueTier(sent1d, { unlock_at: unlockAt }, unlockAt - 3_600)).toBeNull()
    expect(dueTier(sent1d, { unlock_at: unlockAt }, unlockAt)).toBe("0d")
  })

  it("sends at most one reminder per run for a late subscriber and marks earlier tiers done", async () => {
    guard.allowLoopback = true
    const now = Math.floor(Date.now() / 1000)
    db.prepare(`UPDATE locks SET unlock_at = ? WHERE id = 'token:1'`).run(now + 2 * 3_600)
    db.prepare(`UPDATE notification_subscriptions SET webhook_url = ? WHERE id = 's1'`).run(
      `http://localhost:${port}/ok`,
    )

    await runNotifier()
    expect(deliveries).toHaveLength(1)
    expect(JSON.parse(deliveries[0].body)).toMatchObject({ event: "unlock_reminder", reminderDays: 1 })
    expect(
      db.prepare(`SELECT reminded_7d, reminded_1d, reminded_0d FROM notification_subscriptions WHERE id = 's1'`).get(),
    ).toEqual({ reminded_7d: 1, reminded_1d: 1, reminded_0d: 0 })

    // A second run in the same window sends nothing more (the 7-day reminder stays skipped).
    await runNotifier()
    expect(deliveries).toHaveLength(1)
  })
})

describe("Resend email timeout (#1120)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    db.prepare(`UPDATE notification_subscriptions SET webhook_url = NULL, email = 'user@example.com' WHERE id = 's1'`).run()
  })

  it("passes a 10 s AbortSignal to the Resend request", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response("{}", { status: 200 })))
    vi.stubGlobal("fetch", fetchMock)

    await runNotifier()

    expect(timeoutSpy).toHaveBeenCalledWith(10_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("aborts a hung Resend request and still finishes the run", async () => {
    // Shorten the timeout so the test doesn't wait 10 s; the notifier must
    // honour whatever signal AbortSignal.timeout hands it.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal)
    vi.spyOn(AbortSignal, "timeout").mockImplementation(() => realTimeout(20))
    // A fetch that never responds on its own — it only settles when aborted.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
          }),
      ),
    )
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    await runNotifier()

    expect(errSpy.mock.calls.some((c) => /Resend request .* failed/.test(String(c[0])))).toBe(true)
    // The job completed and was marked, rather than stalling the batch.
    expect(
      db.prepare(`SELECT reminded_0d FROM notification_subscriptions WHERE id = 's1'`).get(),
    ).toEqual({ reminded_0d: 1 })
describe("runNotifier withdrawn locks", () => {
  it("sends no reminders for a withdrawn lock and closes out the subscription", async () => {
    guard.allowLoopback = true
    db.prepare("UPDATE locks SET status = 'withdrawn', withdrawn = 1 WHERE id = 'token:1'").run()

    await runNotifier()

    expect(hits).toEqual([])
    const row = db
      .prepare("SELECT reminded_7d, reminded_1d, reminded_0d FROM notification_subscriptions WHERE id = 's1'")
      .get()
    expect(row).toEqual({ reminded_7d: 1, reminded_1d: 1, reminded_0d: 1 })
  })
})

describe("runNotifier email reminders", () => {
  it("the unlock email links to the lock detail page", async () => {
    // The seeded subscription is webhook-only; switch it to email so sendEmail
    // runs. The lock is already past its unlock date (now - 10s), so the 0d
    // "your lock has unlocked" email is among those dispatched.
    db.prepare("UPDATE notification_subscriptions SET email = ?, webhook_url = NULL WHERE id = 's1'")
      .run("user@example.com")

    const emails: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init: any) => {
        if (init?.body) emails.push(String(init.body))
        return { ok: true, status: 200, text: async () => "" } as Response
      }),
    )

    try {
      await runNotifier()
    } finally {
      vi.unstubAllGlobals()
    }

    expect(emails.length).toBeGreaterThan(0)
    // Every reminder email body ends with a link to the lock's detail page:
    //   <APP_BASE_URL>/app/lock/<lockId>
    expect(emails.some((body) => /https:\/\/[^/\s]+\/app\/lock\/token:1/.test(body))).toBe(true)
  const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })))

  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test"
    process.env.NOTIFICATION_LINK_SECRET = "link-secret"
    fetchMock.mockClear()
    vi.stubGlobal("fetch", fetchMock)
    db.exec("DELETE FROM notification_subscriptions")
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    delete process.env.RESEND_API_KEY
    delete process.env.NOTIFICATION_LINK_SECRET
  })

  function insertEmailSub(verified: number) {
    db.prepare(
      `INSERT INTO notification_subscriptions (id, lock_id, address, email, email_verified)
       VALUES ('e1', 'token:1', 'GA', 'user@example.com', ?)`,
    ).run(verified)
  }

  it("does not send reminders to an unverified email", async () => {
    insertEmailSub(0)
    await runNotifier()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends reminders to a verified email with a working lock link and unsubscribe link", async () => {
    insertEmailSub(1)
    await runNotifier()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body))
    expect(body.to).toBe("user@example.com")
    expect(body.text).toContain("/app/lock/token/1")
    expect(body.text).not.toContain("/app/lock/token:1")
    expect(body.text).toMatch(/\/api\/notifications\/unsubscribe-email\?id=e1&token=[0-9a-f]{64}/)
    expect(body.headers["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/api\/notifications\/unsubscribe-email\?id=e1&token=[0-9a-f]{64}>$/)
    expect(body.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })

  it("skips verified email reminders for withdrawn locks", async () => {
    insertEmailSub(1)
    db.prepare("UPDATE locks SET status = 'withdrawn', withdrawn = 1 WHERE id = 'token:1'").run()
    await runNotifier()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
