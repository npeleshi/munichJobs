import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../logger";
import { aiConfigured } from "../ai";
import { evaluateMatch, expandTitlesAi } from "../ai-tasks";
import { loadProfile } from "../cv/store";
import { quickScore } from "../cv/quickscore";
import { detectAts, portalOnly } from "../contacts/extract";
import { applyFilters, dedupe, detectLanguage, inferExperience, isInArea } from "./normalize";
import { expandTitles } from "./expand";
import type { RawJob, SearchParams, SourceReport } from "./types";
import { searchArbeitsagentur } from "./sources/arbeitsagentur";
import { searchArbeitnow } from "./sources/arbeitnow";
import { adzunaConfigured, searchAdzuna } from "./sources/adzuna";
import { deepLinks } from "./sources/deeplinks";

export const searchSchema = z.object({
  titles: z.array(z.string().min(2).max(120)).min(1).max(8),
  language: z.enum(["de", "en", "both"]).default("both"),
  expand: z.boolean().default(true),
  location: z.string().max(80).default("München"),
  radiusKm: z.number().int().min(0).max(200).default(25),
  employment: z.array(z.enum(["full_time", "part_time", "internship", "working_student", "mini_job", "apprenticeship"])).default([]),
  workModes: z.array(z.enum(["remote", "hybrid", "onsite"])).default([]),
  experience: z.array(z.enum(["student", "entry", "mid", "senior", "lead"])).default([]),
  minSalary: z.number().int().min(0).max(500000).nullish(),
  industry: z.string().max(80).nullish(),
  publishedWithinDays: z.number().int().min(1).max(100).default(30),
  sort: z.enum(["relevance", "date", "match"]).default("match"),
});

export const HIGH_MATCH = Number(process.env.HIGH_MATCH_THRESHOLD ?? 75);
const AUTO_AI_TOP = Number(process.env.AI_AUTO_SCORE_TOP ?? 10);

export async function resolveTerms(p: SearchParams): Promise<{ terms: string[]; expandedBy: "none" | "dictionary" | "ai" }> {
  if (!p.expand) return { terms: p.titles, expandedBy: "none" };
  const dict = expandTitles(p.titles, p.language);
  if (!aiConfigured()) return { terms: dict, expandedBy: "dictionary" };
  try {
    const ai = await expandTitlesAi(p.titles, p.language);
    const merged = [...dict];
    for (const t of ai) if (!merged.some((m) => m.toLowerCase() === t.toLowerCase())) merged.push(t);
    return { terms: merged.slice(0, 10), expandedBy: "ai" };
  } catch (e) {
    logger.warn("ai title expansion failed", { err: (e as Error).message });
    return { terms: dict, expandedBy: "dictionary" };
  }
}

export interface SearchOutcome {
  terms: string[];
  expandedBy: string;
  reports: SourceReport[];
  deepLinks: ReturnType<typeof deepLinks>;
  total: number;
  newCount: number;
  jobIds: string[];
}

export async function runSearch(userId: string, p: SearchParams, opts: { aiScore?: boolean } = {}): Promise<SearchOutcome> {
  const { terms, expandedBy } = await resolveTerms(p);

  const tasks: { id: string; label: string; run: () => Promise<RawJob[]> }[] = [
    { id: "arbeitsagentur", label: "Bundesagentur für Arbeit (Jobbörse)", run: () => searchArbeitsagentur(terms, p) },
    { id: "arbeitnow", label: "Arbeitnow (ATS feeds)", run: () => searchArbeitnow(terms, p) },
  ];
  const reports: SourceReport[] = [];
  if (adzunaConfigured()) tasks.push({ id: "adzuna", label: "Adzuna (aggregator)", run: () => searchAdzuna(terms, p) });
  else reports.push({ source: "adzuna", label: "Adzuna (aggregator)", status: "skipped", count: 0, message: "Add ADZUNA_APP_ID / ADZUNA_APP_KEY to enable." });

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const raw: RawJob[] = [];
  settled.forEach((r, i) => {
    const t = tasks[i];
    if (r.status === "fulfilled") {
      raw.push(...r.value);
      reports.unshift({ source: t.id, label: t.label, status: "ok", count: r.value.length });
    } else {
      logger.warn("source failed", { source: t.id, err: String(r.reason) });
      reports.unshift({ source: t.id, label: t.label, status: "error", count: 0, message: String((r.reason as Error)?.message ?? r.reason) });
    }
  });

  // Sources with server-side radius may still return far-away jobs ("bundesweit"); re-check.
  const local = raw.filter((j) => j.source === "arbeitnow" || isInArea(j, p.radiusKm) || j.workMode === "remote");
  const merged = dedupe(applyFilters(local, p));
  const profile = await loadProfile(userId);

  const jobIds: string[] = [];
  let newCount = 0;
  for (const m of merged) {
    const existing = await prisma.job.findUnique({ where: { fingerprint: m.fingerprint } });
    const sources = existing ? mergeSources(existing.sources as Source[], m.sources) : m.sources;
    const data = {
      title: m.title,
      company: m.company,
      location: m.location,
      lat: m.lat ?? null,
      lon: m.lon ?? null,
      salaryText: m.salaryText ?? null,
      salaryMin: m.salaryMin ?? null,
      salaryMax: m.salaryMax ?? null,
      employment: m.employment,
      workMode: m.workMode ?? null,
      experience: inferExperience(m.title),
      industry: m.industry ?? null,
      postedAt: m.postedAt ?? null,
      description: existing && existing.description.length > m.description.length ? existing.description : m.description,
      language: detectLanguage(m.description),
      url: existing?.url ?? m.url,
      applyUrl: m.applyUrl ?? existing?.applyUrl ?? null,
      companyWebsite: m.companyWebsite ?? existing?.companyWebsite ?? null,
      atsVendor: detectAts(m.applyUrl, m.url) ?? (portalOnly(m.description) ? "Online portal (per job ad)" : existing?.atsVendor ?? null),
      sources: sources as unknown as Prisma.InputJsonValue,
    };
    const job = existing
      ? await prisma.job.update({ where: { id: existing.id }, data })
      : await prisma.job.create({ data: { ...data, fingerprint: m.fingerprint } });
    jobIds.push(job.id);

    const qs = profile ? quickScore(profile, job) : null;
    const uj = await prisma.userJob.findUnique({ where: { userId_jobId: { userId, jobId: job.id } } });
    if (!uj) {
      newCount++;
      await prisma.userJob.create({ data: { userId, jobId: job.id, quickScore: qs?.score ?? null } });
    } else if (qs && uj.quickScore !== qs.score) {
      await prisma.userJob.update({ where: { id: uj.id }, data: { quickScore: qs.score } });
    }
  }

  if (profile && aiConfigured() && opts.aiScore !== false) await autoScore(userId, jobIds);

  return { terms, expandedBy, reports, deepLinks: deepLinks({ ...p, titles: terms }), total: jobIds.length, newCount, jobIds };
}

type Source = { source: string; externalId: string; url: string };
function mergeSources(a: Source[], b: Source[]): Source[] {
  const out = [...(a ?? [])];
  for (const s of b) if (!out.some((x) => x.source === s.source && x.externalId === s.externalId)) out.push(s);
  return out;
}

/** Run the Claude evaluation for the best keyword candidates that don't have one yet. */
export async function autoScore(userId: string, jobIds: string[]) {
  const candidates = await prisma.userJob.findMany({
    where: { userId, jobId: { in: jobIds }, aiScore: null },
    orderBy: { quickScore: "desc" },
    take: AUTO_AI_TOP,
    include: { job: true },
  });
  await Promise.all(
    candidates.map((c) =>
      scoreUserJob(userId, c.jobId).catch((e) => logger.warn("auto score failed", { jobId: c.jobId, err: (e as Error).message })),
    ),
  );
}

export async function scoreUserJob(userId: string, jobId: string) {
  const profile = await loadProfile(userId);
  if (!profile) throw new Error("Upload and analyse your CV first.");
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const match = await evaluateMatch(profile, job);
  const uj = await prisma.userJob.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId, aiScore: match.score, matchJson: match as unknown as Prisma.InputJsonValue },
    update: { aiScore: match.score, matchJson: match as unknown as Prisma.InputJsonValue },
  });
  if (uj.status === "NEW" && match.score >= HIGH_MATCH) {
    await prisma.userJob.update({ where: { id: uj.id }, data: { status: "HIGH_MATCH" } });
  }
  return match;
}
