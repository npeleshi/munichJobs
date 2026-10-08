import { route, requireUser, limit, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { aiConfigured } from "@/lib/ai";
import { scoreUserJob } from "@/lib/jobs/search";

export const maxDuration = 60;

export const POST = route<{ params: { id: string } }>(async (_req, { params }) => {
  const userId = await requireUser();
  if (!aiConfigured()) throw new HttpError(503, "AI is not configured (ANTHROPIC_API_KEY missing).");
  limit(userId, "ai", LIMITS.ai);
  return { match: await scoreUserJob(userId, params.id) };
});
