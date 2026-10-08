import { route, requireUser, limit, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { encryptString } from "@/lib/crypto";
import { aiConfigured } from "@/lib/ai";
import { analyzeCv } from "@/lib/ai-tasks";
import { loadCv } from "@/lib/cv/store";

export const maxDuration = 90;

export const POST = route(async () => {
  const userId = await requireUser();
  if (!aiConfigured()) throw new HttpError(503, "AI is not configured (ANTHROPIC_API_KEY missing).");
  limit(userId, "ai", LIMITS.ai);
  const cv = await loadCv(userId);
  if (!cv) throw new HttpError(404, "No CV uploaded");
  const profile = await analyzeCv(cv.text);
  await prisma.cv.update({ where: { userId }, data: { profileEnc: encryptString(JSON.stringify(profile)), analyzedAt: new Date() } });
  return { profile };
});
