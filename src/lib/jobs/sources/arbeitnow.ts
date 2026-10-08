// Arbeitnow – free public job-board API (jobs from ATS such as Greenhouse,
// SmartRecruiters, Join, Recruitee, Personio…). No key required.
// https://www.arbeitnow.com/api/job-board-api   (paginated, no server-side keyword search)
import type { EmploymentType, RawJob, SearchParams } from "../types";
import { htmlToText, inferEmploymentFromText, inferWorkMode, isInArea, matchesTerms } from "../normalize";

type Fetch = typeof fetch;

export interface ArbeitnowItem {
  slug: string;
  company_name: string;
  title: string;
  description: string;
  remote: boolean;
  url: string;
  tags?: string[];
  job_types?: string[];
  location: string;
  created_at: number;
}

export function mapArbeitnow(it: ArbeitnowItem): RawJob {
  const description = htmlToText(it.description ?? "");
  const emp = new Set<EmploymentType>(inferEmploymentFromText([it.title, ...(it.job_types ?? [])].join(" ")));
  for (const t of it.job_types ?? []) {
    const k = t.toLowerCase();
    if (k.includes("full")) emp.add("full_time");
    if (k.includes("part")) emp.add("part_time");
    if (k.includes("intern")) emp.add("internship");
    if (k.includes("student")) emp.add("working_student");
  }
  return {
    source: "arbeitnow",
    externalId: it.slug,
    title: it.title.trim(),
    company: it.company_name.trim(),
    location: it.location,
    employment: [...emp],
    workMode: it.remote ? "remote" : inferWorkMode(description),
    industry: it.tags?.[0] ?? null,
    postedAt: it.created_at ? new Date(it.created_at * 1000) : null,
    description,
    url: it.url,
    applyUrl: it.url,
  };
}

export async function searchArbeitnow(terms: string[], p: SearchParams, f: Fetch = fetch, pages = 5): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (let page = 1; page <= pages; page++) {
    const res = await f(`https://www.arbeitnow.com/api/job-board-api?page=${page}`, {
      headers: { Accept: "application/json", "User-Agent": "MunichJobAssistant/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`Arbeitnow HTTP ${res.status}`);
    const data = (await res.json()) as { data?: ArbeitnowItem[]; links?: { next?: string | null } };
    for (const it of data.data ?? []) {
      const j = mapArbeitnow(it);
      const inArea = isInArea(j, p.radiusKm) || (j.workMode === "remote" && p.workModes.includes("remote"));
      if (inArea && matchesTerms(j, terms)) out.push(j);
    }
    if (!data.links?.next) break;
  }
  return out;
}
