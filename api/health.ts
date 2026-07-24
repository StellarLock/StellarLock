export default function handler(req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) {
  res.status(200).json({
    status: "ok",
    service: "stellarlock-frontend",
    environment: process.env.NODE_ENV || "production",
    version: process.env.npm_package_version || "0.1.0",
    dependencies: {
      rpc: "ready",
      horizon: "ready",
      freighter: "unknown",
    },
  })
}
