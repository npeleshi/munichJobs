import { z } from "zod";
import { route, requireUser, HttpError } from "@/lib/http";
import { prisma } from "@/lib/db";

type Ctx = { params: { id: string } };

export const GET = route<Ctx>(async (_req, { params }) => {
  const userId = await requireUser();
  const job = await prisma.job.findUnique({ where: { id: params.id }, include: { contacts: true } });
  if (!job) throw new HttpError(404, "Job not found");
  const userJob = await prisma.userJob.upsert({
    where: { userId_jobId: { userId, jobId: job.id } },
    create: { userId, jobId: job.id, isNew: false },
    update: { isNew: false }, // opened → no longer "new"
  });
  const application = await prisma.application.findUnique({ where: { userId_jobId: { userId, jobId: job.id } } });
  // Same company, already applied elsewhere recently → warn (not block)
  const sameCompany = await prisma.application.findMany({
    where: { userId, status: "sent", jobId: { not: job.id }, job: { company: { equals: job.company, mode: "insensitive" } } },
    select: { sentAt: true, job: { select: { title: true } } },
  });
  return { job, userJob, application, sameCompany };
});

const patchSchema = z.object({
  saved: z.boolean().optional(),
  hidden: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["NEW", "HIGH_MATCH", "PREPARED", "READY", "SENT", "INTERVIEW", "REJECTED", "OFFER"]).optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const userId = await requireUser();
  const data = patchSchema.parse(await req.json());
  if (data.status === "SENT") {
    const app = await prisma.application.findUnique({ where: { userId_jobId: { userId, jobId: params.id } } });
    if (app?.status !== "sent") throw new HttpError(400, "A job is marked 'Application sent' automatically after a successful send.");
  }
  return prisma.userJob.upsert({
    where: { userId_jobId: { userId, jobId: params.id } },
    create: { userId, jobId: params.id, ...data },
    update: data,
  });
});
