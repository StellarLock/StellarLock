export type BackendLogLevel = "debug" | "info" | "warn" | "error"
export type BackendLogFields = Record<string, unknown>

function normaliseError(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  return { name: error.name, message: error.message, stack: error.stack }
}

function emit(level: BackendLogLevel, component: string, msg: string, fields: BackendLogFields = {}): void {
  const entry = {
    level,
    msg,
    fields: { component, ...fields },
    timestamp: new Date().toISOString(),
  }
  process.stdout.write(`${JSON.stringify(entry, (_key, value) => normaliseError(value))}\n`)
}

export interface BackendLogger {
  debug(msg: string, fields?: BackendLogFields): void
  info(msg: string, fields?: BackendLogFields): void
  warn(msg: string, fields?: BackendLogFields): void
  error(msg: string, fields?: BackendLogFields): void
}

export function createBackendLogger(component: string): BackendLogger {
  return {
    debug: (msg, fields) => emit("debug", component, msg, fields),
    info: (msg, fields) => emit("info", component, msg, fields),
    warn: (msg, fields) => emit("warn", component, msg, fields),
    error: (msg, fields) => emit("error", component, msg, fields),
  }
}
