import { route, requireUser, limit } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { runSearch, searchSchema } from "@/lib/jobs/search";

export const maxDuration = 120;

export const POST = route(async (req) => {
  const userId = await requireUser();
  limit(userId, "search", LIMITS.search);
  const params = searchSchema.parse(await req.json());
  return runSearch(userId, params);
});
