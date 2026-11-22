/** Minimal HTML responses for endpoints opened from links in emails. */

export interface HtmlRes {
  setHeader(name: string, value: string): void
  status(code: number): { send(body: string): void; json(payload: unknown): void; end(): void }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export function sendHtml(res: HtmlRes, code: number, title: string, bodyHtml: string) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.status(code).send(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title>` +
      `<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5}` +
      `button{font:inherit;padding:.5rem 1rem;cursor:pointer}</style></head>` +
      `<body><h1>${escapeHtml(title)}</h1>${bodyHtml}</body></html>`,
  )
}

