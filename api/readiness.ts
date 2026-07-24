export default function handler(req: unknown, res: { status: (code: number) => { json: (payload: unknown) => void } }) {
  res.status(200).json({
    status: "ready",
    service: "stellarlock-frontend",
    ready: true,
    checkedAt: new Date().toISOString(),
  })
}
