// Save the profile the user edits by hand (free mode, or corrections to the AI profile).
import { z } from "zod";
import { route, requireUser, HttpError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { encryptString } from "@/lib/crypto";
import { loadCv } from "@/lib/cv/store";
import { emptyProfile, fixMojibake } from "@/lib/cv/heuristic";
import { quickScore } from "@/lib/cv/quickscore";

// Lenient: long values are trimmed instead of rejected, so a pasted CV section never blocks saving.
const str = (max: number) => z.string().transform((v) => v.trim().slice(0, max));
const nstr = (max: number) => z.string().nullable().transform((v) => (v ? v.trim().slice(0, max) : null));
const arr = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));

const schema = z.object({
  name: nstr(120),
  email: nstr(254),
  phone: nstr(60),
  location: nstr(120),
  headline: nstr(160),
  totalYearsExperience: z.number().nullable().transform((n) => (n == null || !Number.isFinite(n) ? null : Math.max(0, Math.min(60, Math.round(n))))),
  skills: arr(str(80), 80),
  languages: arr(z.object({ language: str(60), level: str(60) }), 20),
  industries: arr(str(80), 30),
  careerInterests: arr(str(120), 30),
  achievements: arr(str(500), 20),
  certifications: arr(str(250), 30),
});

export const PUT = route(async (req) => {
  const userId = await requireUser();
  const input = schema.parse(await req.json());
  const cv = await loadCv(userId);
  if (!cv) throw new HttpError(400, "Upload your CV first.");
  const profile = JSON.parse(fixMojibake(JSON.stringify({ ...emptyProfile(), ...(cv.profile ?? {}), ...input })));
  await prisma.cv.update({ where: { userId }, data: { profileEnc: encryptString(JSON.stringify(profile)) } });
  const rows = await prisma.userJob.findMany({ where: { userId }, include: { job: true } });
  for (const r of rows) {
    await prisma.userJob.update({ where: { id: r.id }, data: { quickScore: quickScore(profile, r.job).score } });
  }
  return { profile };
});
