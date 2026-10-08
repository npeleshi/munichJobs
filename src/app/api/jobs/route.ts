import type { Prisma } from "@prisma/client";
import { route, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";
import { HIGH_MATCH } from "@/lib/jobs/search";
import { summarize } from "@/lib/jobs/normalize";

// GET /api/jobs?view=all|high|saved|new&sort=match|date|relevance&ids=a,b&q=text
export const GET = route(async (req) => {
  const userId = await requireUser();
  const sp = new URL(req.url).searchParams;
  const view = sp.get("view") ?? "all";
  const sort = sp.get("sort") ?? "match";
  const ids = sp.get("ids")?.split(",").filter(Boolean);
  const q = sp.get("q")?.trim();

  const where: Prisma.UserJobWhereInput = { userId, hidden: false };
  if (ids?.length) where.jobId = { in: ids };
  if (view === "saved") where.saved = true;
  if (view === "new") where.isNew = true;
  if (view === "high") where.OR = [{ aiScore: { gte: HIGH_MATCH } }, { aiScore: null, quickScore: { gte: HIGH_MATCH } }];
  if (q) where.job = { OR: [{ title: { contains: q, mode: "insensitive" } }, { company: { contains: q, mode: "insensitive" } }] };

  const rows = await prisma.userJob.findMany({
    where,
    include: { job: { include: { contacts: { select: { kind: true } } } } },
    take: 300,
  });

  const items = rows.map((r) => ({
    jobId: r.jobId,
    title: r.job.title,
    company: r.job.company,
    location: r.job.location,
    salaryText: r.job.salaryText,
    postedAt: r.job.postedAt,
    workMode: r.job.workMode,
    employment: r.job.employment,
    url: r.job.url,
    sources: r.job.sources,
    summary: summarize(r.job.description),
    contactStatus: r.job.contactStatus,
    atsVendor: r.job.atsVendor,
    score: r.aiScore ?? r.quickScore,
    scoreKind: r.aiScore != null ? "ai" : r.quickScore != null ? "estimate" : null,
    status: r.status,
    saved: r.saved,
    isNew: r.isNew,
    firstSeenAt: r.firstSeenAt,
  }));

  const order = ids?.length ? new Map(ids.map((id, i) => [id, i])) : null;
  items.sort((a, b) => {
    if (sort === "date") return (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0);
    if (sort === "relevance" && order) return (order.get(a.jobId) ?? 0) - (order.get(b.jobId) ?? 0);
    return (b.score ?? -1) - (a.score ?? -1);
  });
  return { items };
});
