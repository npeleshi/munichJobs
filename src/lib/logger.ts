// Structured JSON logger. Redacts e-mail addresses and tokens so personal data
// does not end up in log aggregation (GDPR data minimisation).
type Level = "debug" | "info" | "warn" | "error";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function redact(v: unknown): unknown {
  if (typeof v === "string") return v.replace(EMAIL_RE, "[email]");
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = /token|secret|password|authorization|key/i.test(k) ? "[redacted]" : redact(val);
    }
    return out;
  }
  return v;
}

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(redact(meta ?? {}) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => process.env.LOG_LEVEL === "debug" && log("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
};
