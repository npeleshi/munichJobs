import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, requireUser, limit, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { BANNED_PHRASES, draftApplication } from "@/lib/ai-tasks";
import { loadCv } from "@/lib/cv/store";
import { factCheck } from "@/lib/mail/factcheck";
import { rank } from "@/lib/contacts/extract";
import { templateDraft } from "@/lib/mail/template";

export const maxDuration = 60;

export const GET = route(async (req) => {
  const userId = await requireUser();
  const status = new URL(req.url).searchParams.get("status");
  const apps = await prisma.application.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { job: { select: { id: true, title: true, company: true, location: true, url: true, userJobs: { where: { userId }, select: { status: true, notes: true } } } } },
  });
  return { items: apps };
});

const createSchema = z.object({
  jobId: z.string(),
  language: z.enum(["auto", "de", "en"]).default("auto"),
  withCoverLetter: z.boolean().default(false),
  instructions: z.string().max(1000).nullish(),
});

/** Create or regenerate the draft for a job. Never sends anything. */
export const POST = route(async (req) => {
  const userId = await requireUser();
  const useAi = aiConfigured();
  if (useAi) limit(userId, "ai", LIMITS.ai);
  const input = createSchema.parse(await req.json());

  const existing = await prisma.application.findUnique({ where: { userId_jobId: { userId, jobId: input.jobId } } });
  if (existing && ["sent", "sending"].includes(existing.status)) throw new HttpError(409, "You have already applied to this position.");

  const [cv, job, user] = await Promise.all([
    loadCv(userId),
    prisma.job.findUnique({ where: { id: input.jobId }, include: { contacts: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
  ]);
  if (!cv?.profile) throw new HttpError(400, "Upload your CV (and complete your profile) before preparing applications.");
  if (!job) throw new HttpError(404, "Job not found");

  const language = input.language !== "auto" ? input.language : user.preferredLanguage !== "auto" ? (user.preferredLanguage as "de" | "en") : ((job.language as "de" | "en") ?? "de");
  const contact = [...job.contacts].sort((a, b) => rank(b.kind as never) - rank(a.kind as never))[0] ?? null;

  const draftInput = {
    profile: cv.profile,
    cvText: cv.text,
    job,
    language,
    recipientName: contact?.kind === "named_recruiter" ? contact.personName : null,
    withCoverLetter: input.withCoverLetter,
    signature: user.signature,
    instructions: input.instructions,
  };
  // Free mode uses a fact-only template; with an API key Claude writes a tailored draft.
  const draft = useAi
    ? await draftApplication(draftInput)
    : templateDraft({ profile: cv.profile, job, language, recipientName: draftInput.recipientName, withCoverLetter: input.withCoverLetter, signature: user.signature });
  const warnings = factCheck(draft, cv.text, job, BANNED_PHRASES);
  const data = {
    subject: draft.subject,
    body: draft.body,
    coverLetter: draft.coverLetter,
    language,
    toEmail: existing?.toEmail ?? contact?.email ?? null,
    contactId: existing?.contactId ?? contact?.id ?? null,
    warnings: { checks: warnings, usedFacts: draft.usedFacts } as unknown as Prisma.InputJsonValue,
    status: "draft",
    error: null,
  };
  const app = existing
    ? await prisma.application.update({ where: { id: existing.id }, data })
    : await prisma.application.create({ data: { ...data, userId, jobId: job.id } });

  await prisma.userJob.upsert({
    where: { userId_jobId: { userId, jobId: job.id } },
    create: { userId, jobId: job.id, status: "PREPARED", isNew: false },
    update: { status: "PREPARED" },
  });
  return { application: app };
});
