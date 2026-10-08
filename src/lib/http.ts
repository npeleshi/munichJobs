import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getUserId } from "./auth";
import { rateLimit } from "./ratelimit";
import { logger } from "./logger";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function requireUser(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new HttpError(401, "Not signed in");
  return id;
}

export function limit(userId: string, name: string, cfg: { limit: number; windowMs: number }) {
  const r = rateLimit(`${name}:${userId}`, cfg.limit, cfg.windowMs);
  if (!r.ok) throw new HttpError(429, `Rate limit reached for ${name}. Try again in ${Math.ceil(r.retryAfterMs / 60000)} min.`);
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wraps a route handler with consistent JSON responses and error handling. */
export function route<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C) => {
    try {
      const out = await fn(req, ctx);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid input", details: e.flatten() }, { status: 400 });
      logger.error("unhandled route error", { url: req.url, err: (e as Error).message, stack: (e as Error).stack });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
