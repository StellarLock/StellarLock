import { checkUrl, NETWORK_URLS } from "./_lib/network-health"

export default async function handler(req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) {
  const [rpc, horizon] = await Promise.all([
    checkUrl(NETWORK_URLS.rpcUrl, "/health"),
    checkUrl(NETWORK_URLS.horizonUrl, "/"),
  ])

  const dependencies = {
    rpc: rpc.status,
    horizon: horizon.status,
    freighter: "unknown" as const,
  }

  const overallOk = rpc.status === "ok" && horizon.status === "ok"

  res.status(overallOk ? 200 : 503).json({
    status: overallOk ? "ok" : "degraded",
    service: "stellarlock-frontend",
    environment: process.env.NODE_ENV || "production",
    version: process.env.npm_package_version || "0.1.0",
    dependencies,
    detail: {
      rpc: rpc.detail,
      horizon: horizon.detail,
    },
  })
}
