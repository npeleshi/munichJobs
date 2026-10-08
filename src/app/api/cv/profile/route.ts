// Save the profile the user edits by hand (free mode, or corrections to the AI profile).
import { z } from "zod";
import { route, requireUser, HttpError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { encryptString } from "@/lib/crypto";
import { loadCv } from "@/lib/cv/store";
import { emptyProfile } from "@/lib/cv/heuristic";
import { quickScore } from "@/lib/cv/quickscore";

const schema = z.object({
  name: z.string().max(120).nullable(),
  email: z.string().max(254).nullable(),
  phone: z.string().max(60).nullable(),
  location: z.string().max(120).nullable(),
  headline: z.string().max(160).nullable(),
  totalYearsExperience: z.number().int().min(0).max(60).nullable(),
  skills: z.array(z.string().max(60)).max(60),
  languages: z.array(z.object({ language: z.string().max(40), level: z.string().max(40) })).max(15),
  industries: z.array(z.string().max(60)).max(20),
  careerInterests: z.array(z.string().max(80)).max(20),
  achievements: z.array(z.string().max(300)).max(10),
  certifications: z.array(z.string().max(120)).max(20),
});

export const PUT = route(async (req) => {
  const userId = await requireUser();
  const input = schema.parse(await req.json());
  const cv = await loadCv(userId);
  if (!cv) throw new HttpError(400, "Upload your CV first.");
  const profile = { ...emptyProfile(), ...(cv.profile ?? {}), ...input };
  await prisma.cv.update({ where: { userId }, data: { profileEnc: encryptString(JSON.stringify(profile)) } });
  const rows = await prisma.userJob.findMany({ where: { userId }, include: { job: true } });
  for (const r of rows) {
    await prisma.userJob.update({ where: { id: r.id }, data: { quickScore: quickScore(profile, r.job).score } });
  }
  return { profile };
});
