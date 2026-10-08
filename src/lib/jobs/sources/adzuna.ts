// Adzuna – official job-search API (aggregates many German job boards and
// company sites). Requires a free key: https://developer.adzuna.com
import type { EmploymentType, RawJob, SearchParams } from "../types";
import { htmlToText, inferEmploymentFromText, inferWorkMode } from "../normalize";

type Fetch = typeof fetch;

export interface AdzunaItem {
  id: string;
  title: string;
  description: string;
  created: string;
  redirect_url: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  latitude?: number;
  longitude?: number;
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string | number;
  contract_time?: string;
  category?: { label?: string };
}

export const adzunaConfigured = () => Boolean(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY);

export function mapAdzuna(it: AdzunaItem): RawJob {
  const title = htmlToText(it.title);
  const description = htmlToText(it.description ?? "");
  const emp = new Set<EmploymentType>(inferEmploymentFromText(title));
  if (it.contract_time === "full_time") emp.add("full_time");
  if (it.contract_time === "part_time") emp.add("part_time");
  // Adzuna sometimes *predicts* salaries – never show a prediction as the employer's figure.
  const predicted = String(it.salary_is_predicted) === "1";
  const hasSalary = !predicted && (it.salary_min || it.salary_max);
  return {
    source: "adzuna",
    externalId: String(it.id),
    title,
    company: it.company?.display_name?.trim() || "Unknown employer",
    location: it.location?.display_name ?? "",
    lat: it.latitude ?? null,
    lon: it.longitude ?? null,
    salaryText: hasSalary ? `${Math.round(it.salary_min ?? it.salary_max!).toLocaleString("de-DE")} – ${Math.round(it.salary_max ?? it.salary_min!).toLocaleString("de-DE")} € p.a.` : null,
    salaryMin: hasSalary ? Math.round(it.salary_min ?? it.salary_max!) : null,
    salaryMax: hasSalary ? Math.round(it.salary_max ?? it.salary_min!) : null,
    employment: [...emp],
    workMode: inferWorkMode(`${title} ${description}`),
    industry: it.category?.label ?? null,
    postedAt: it.created ? new Date(it.created) : null,
    description, // note: Adzuna returns a snippet; full text is on the original listing
    url: it.redirect_url,
    applyUrl: it.redirect_url,
  };
}

export async function searchAdzuna(terms: string[], p: SearchParams, f: Fetch = fetch): Promise<RawJob[]> {
  const id = process.env.ADZUNA_APP_ID!, key = process.env.ADZUNA_APP_KEY!;
  const out: RawJob[] = [];
  for (const term of terms) {
    const q = new URLSearchParams({
      app_id: id,
      app_key: key,
      what: term.replace(/\(.*?\)/g, "").trim(),
      where: p.location || "München",
      distance: String(p.radiusKm),
      results_per_page: "50",
      "content-type": "application/json",
      sort_by: p.sort === "date" ? "date" : "relevance",
    });
    if (p.publishedWithinDays) q.set("max_days_old", String(p.publishedWithinDays));
    if (p.minSalary) q.set("salary_min", String(p.minSalary));
    if (p.employment.length === 1 && p.employment[0] === "full_time") q.set("full_time", "1");
    if (p.employment.length === 1 && p.employment[0] === "part_time") q.set("part_time", "1");
    const res = await f(`https://api.adzuna.com/v1/api/jobs/de/search/1?${q}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Adzuna HTTP ${res.status}`);
    const data = (await res.json()) as { results?: AdzunaItem[] };
    out.push(...(data.results ?? []).map(mapAdzuna));
  }
  return out;
}
