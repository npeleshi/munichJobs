import { Prisma } from "@prisma/client";
import { route, requireUser, limit, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { encryptBuffer, encryptString } from "@/lib/crypto";
import { ALLOWED_MIME, MAX_CV_BYTES, extractCvText, sniffType } from "@/lib/cv/extract";
import { loadCv } from "@/lib/cv/store";
import { aiConfigured } from "@/lib/ai";
import { analyzeCv } from "@/lib/ai-tasks";
import { quickScore } from "@/lib/cv/quickscore";
import { logger } from "@/lib/logger";

export const maxDuration = 90;

async function cvView(userId: string) {
  const cv = await loadCv(userId);
  if (!cv) return null;
  return { fileName: cv.fileName, sizeBytes: cv.sizeBytes, mimeType: cv.mimeType, analyzedAt: cv.analyzedAt, updatedAt: cv.updatedAt, profile: cv.profile, textPreview: cv.text.slice(0, 1500) };
}

export const GET = route(async () => ({ cv: await cvView(await requireUser()) }));

/** Upload or replace the CV, extract text, run AI analysis, re-rank existing jobs. */
export const POST = route(async (req) => {
  const userId = await requireUser();
  limit(userId, "upload", LIMITS.upload);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded.");
  if (file.size > MAX_CV_BYTES) throw new HttpError(413, "CV must be 8 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffType(buf);
  const declared = ALLOWED_MIME[file.type];
  if (!kind || (declared && declared !== kind)) throw new HttpError(415, "Please upload a PDF or DOCX file.");

  let text: string;
  try {
    text = await extractCvText(buf, kind);
  } catch (e) {
    throw new HttpError(422, (e as Error).message);
  }
  const mimeType = kind === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fileName = file.name.replace(/[\\/\r\n]/g, "_").slice(0, 150) || `CV.${kind}`;

  let profileEnc: string | null = null;
  let analyzedAt: Date | null = null;
  let analysisError: string | null = null;
  if (aiConfigured()) {
    try {
      const profile = await analyzeCv(text);
      profileEnc = encryptString(JSON.stringify(profile));
      analyzedAt = new Date();
    } catch (e) {
      analysisError = (e as Error).message;
      logger.warn("cv analysis failed", { err: analysisError });
    }
  } else analysisError = "AI is not configured – CV stored, but not analysed.";

  const data = { fileName, mimeType, sizeBytes: buf.length, fileEnc: encryptBuffer(buf), textEnc: encryptString(text), profileEnc, analyzedAt };
  await prisma.cv.upsert({ where: { userId }, create: { userId, ...data }, update: data });

  // New CV → previous scores are stale. Recompute estimates; clear AI scores.
  if (profileEnc) {
    const cv = await loadCv(userId);
    const rows = await prisma.userJob.findMany({ where: { userId }, include: { job: true } });
    for (const r of rows) {
      await prisma.userJob.update({ where: { id: r.id }, data: { quickScore: quickScore(cv!.profile!, r.job).score, aiScore: null, matchJson: Prisma.DbNull } });
    }
  }
  return { cv: await cvView(userId), analysisError };
});

/** GDPR: erase the CV (file, text and profile) immediately. */
export const DELETE = route(async () => {
  const userId = await requireUser();
  await prisma.cv.deleteMany({ where: { userId } });
  await prisma.userJob.updateMany({ where: { userId }, data: { quickScore: null, aiScore: null } });
  return { ok: true };
});
