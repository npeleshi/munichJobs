import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, requireUser, HttpError } from "@/lib/http";
import { prisma } from "@/lib/db";
import { loadCv } from "@/lib/cv/store";
import { factCheck } from "@/lib/mail/factcheck";
import { BANNED_PHRASES } from "@/lib/ai-tasks";
import { EMAIL_SYNTAX } from "@/lib/mail/mime";

type Ctx = { params: { id: string } };

async function own(userId: string, id: string) {
  const app = await prisma.application.findUnique({ where: { id }, include: { job: true } });
  if (!app || app.userId !== userId) throw new HttpError(404, "Application not found");
  return app;
}

const patchSchema = z.object({
  subject: z.string().min(3).max(250).optional(),
  body: z.string().min(20).max(20000).optional(),
  coverLetter: z.string().max(20000).nullable().optional(),
  toEmail: z.string().max(254).nullable().optional(),
  contactId: z.string().nullable().optional(),
  markReady: z.boolean().optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const userId = await requireUser();
  const app = await own(userId, params.id);
  if (["sent", "sending"].includes(app.status)) throw new HttpError(409, "This application has already been sent.");
  const input = patchSchema.parse(await req.json());
  if (input.toEmail && !EMAIL_SYNTAX.test(input.toEmail)) throw new HttpError(400, "That doesn't look like a valid e-mail address.");

  const subject = input.subject ?? app.subject;
  const body = input.body ?? app.body;
  const cv = await loadCv(userId);
  const checks = cv ? factCheck({ subject, body }, cv.text, app.job, BANNED_PHRASES) : [];
  const prev = (app.warnings as { usedFacts?: string[] } | null) ?? {};

  const updated = await prisma.application.update({
    where: { id: app.id },
    data: {
      subject,
      body,
      ...(input.coverLetter !== undefined ? { coverLetter: input.coverLetter } : {}),
      ...(input.toEmail !== undefined ? { toEmail: input.toEmail?.trim().toLowerCase() || null } : {}),
      ...(input.contactId !== undefined ? { contactId: input.contactId } : {}),
      warnings: { checks, usedFacts: prev.usedFacts ?? [] } as unknown as Prisma.InputJsonValue,
      status: input.markReady ? "ready" : app.status === "failed" ? "failed" : "draft",
    },
  });
  if (input.markReady) {
    await prisma.userJob.update({ where: { userId_jobId: { userId, jobId: app.jobId } }, data: { status: "READY" } });
  }
  return { application: updated };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const userId = await requireUser();
  const app = await own(userId, params.id);
  if (app.status === "sent") throw new HttpError(409, "Sent applications are kept as your record.");
  await prisma.application.delete({ where: { id: app.id } });
  await prisma.userJob.updateMany({ where: { userId, jobId: app.jobId }, data: { status: "NEW" } });
  return { ok: true };
});
