import { checkUrl, NETWORK_URLS } from "./_lib/network-health"

export default async function handler(req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) {
  const [rpc, horizon] = await Promise.all([
    checkUrl(NETWORK_URLS.rpcUrl, "/health"),
    checkUrl(NETWORK_URLS.horizonUrl, "/"),
  ])

  const ready = rpc.status === "ok" && horizon.status === "ok"

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "stellarlock-frontend",
    ready,
    checkedAt: new Date().toISOString(),
    dependencies: {
      rpc: rpc.status,
      horizon: horizon.status,
    },
  })
}
