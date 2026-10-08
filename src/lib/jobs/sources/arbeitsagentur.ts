// Bundesagentur für Arbeit – Jobbörse (public REST API used by the official app/website).
// Docs: https://jobsuche.api.bund.dev  ·  Auth: header X-API-Key: jobboerse-jobsuche
import type { EmploymentType, RawJob, SearchParams, WorkMode } from "../types";
import { htmlToText, inferEmploymentFromText, inferWorkMode, parseSalary } from "../normalize";

const BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
const HEADERS = { "X-API-Key": "jobboerse-jobsuche", Accept: "application/json", "User-Agent": "MunichJobAssistant/1.0" };

type Fetch = typeof fetch;

export interface BaListItem {
  refnr?: string;
  referenznummer?: string;
  titel?: string;
  beruf?: string;
  arbeitgeber?: string;
  aktuelleVeroeffentlichungsdatum?: string;
  arbeitsort?: { plz?: string | number; ort?: string; region?: string; koordinaten?: { lat?: number; lon?: number } };
  externeUrl?: string | null;
}

export interface BaDetail {
  stellenangebotsTitel?: string;
  titel?: string;
  stellenangebotsBeschreibung?: string;
  stellenbeschreibung?: string;
  verguetung?: string;
  branche?: string;
  branchengruppe?: string;
  arbeitszeitmodelle?: string[];
  angebotsart?: string;
  arbeitgeberdarstellungUrl?: string;
  allianzpartnerUrl?: string;
}

export const baPublicUrl = (refnr: string) => `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;

export function buildBaQuery(term: string, p: SearchParams, angebotsart: number, page = 1): URLSearchParams {
  const q = new URLSearchParams({
    was: term.replace(/\(.*?\)/g, "").trim(),
    wo: p.location || "München",
    umkreis: String(Math.max(0, Math.min(200, p.radiusKm))),
    angebotsart: String(angebotsart),
    page: String(page),
    size: "50",
    pav: "false",
  });
  if (p.publishedWithinDays) q.set("veroeffentlichtseit", String(Math.min(100, p.publishedWithinDays)));
  const az: string[] = [];
  if (p.employment.includes("full_time")) az.push("vz");
  if (p.employment.includes("part_time") || p.employment.includes("working_student")) az.push("tz");
  if (p.employment.includes("mini_job")) az.push("mj");
  // "ho" restricts to home-office-capable jobs – only when the user wants exclusively remote/hybrid
  if (p.workModes.length && !p.workModes.includes("onsite")) az.push("ho");
  if (az.length) q.set("arbeitszeit", az.join(";"));
  return q;
}

export function angebotsartenFor(p: SearchParams): number[] {
  const set = new Set<number>();
  const e = p.employment;
  if (!e.length || e.some((x) => ["full_time", "part_time", "working_student", "mini_job"].includes(x))) set.add(1);
  if (e.includes("internship")) set.add(34);
  if (e.includes("apprenticeship")) set.add(4);
  return [...set];
}

export function mapBa(item: BaListItem, detail: BaDetail | null, angebotsart: number): RawJob | null {
  const refnr = item.refnr ?? item.referenznummer;
  if (!refnr) return null;
  const title = detail?.stellenangebotsTitel ?? detail?.titel ?? item.titel ?? item.beruf ?? "";
  if (!title) return null;
  const descHtml = detail?.stellenangebotsBeschreibung ?? detail?.stellenbeschreibung ?? "";
  const description = descHtml ? htmlToText(descHtml) : [item.beruf, "Full description available on the original listing."].filter(Boolean).join(" – ");
  const ort = item.arbeitsort;
  const employment = new Set<EmploymentType>();
  for (const m of detail?.arbeitszeitmodelle ?? []) {
    if (m === "VOLLZEIT") employment.add("full_time");
    if (m === "TEILZEIT") employment.add("part_time");
    if (m === "MINIJOB") employment.add("mini_job");
  }
  if (angebotsart === 34) employment.add("internship");
  if (angebotsart === 4) employment.add("apprenticeship");
  inferEmploymentFromText(title).forEach((x) => employment.add(x));
  let workMode: WorkMode | null = inferWorkMode(`${title}\n${description}`);
  if (!workMode && detail?.arbeitszeitmodelle?.includes("HEIM_TELEARBEIT")) workMode = "hybrid";
  const sal = parseSalary(detail?.verguetung);
  const external = item.externeUrl || null;
  return {
    source: "arbeitsagentur",
    externalId: refnr,
    title: title.trim(),
    company: (item.arbeitgeber ?? "Unknown employer").trim(),
    location: [ort?.plz, ort?.ort].filter(Boolean).join(" ") || ort?.region || "",
    lat: ort?.koordinaten?.lat ?? null,
    lon: ort?.koordinaten?.lon ?? null,
    salaryText: detail?.verguetung?.trim() || null,
    salaryMin: sal.min,
    salaryMax: sal.max,
    employment: [...employment],
    workMode,
    industry: detail?.branche ?? detail?.branchengruppe ?? null,
    postedAt: item.aktuelleVeroeffentlichungsdatum ? new Date(item.aktuelleVeroeffentlichungsdatum) : null,
    description,
    url: baPublicUrl(refnr),
    applyUrl: external,
    companyWebsite: detail?.arbeitgeberdarstellungUrl || null,
  };
}

async function getJson<T>(url: string, f: Fetch): Promise<T> {
  const res = await f(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Arbeitsagentur HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T, idx: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

export async function searchArbeitsagentur(terms: string[], p: SearchParams, f: Fetch = fetch, maxDetails = 60): Promise<RawJob[]> {
  const listed: { item: BaListItem; art: number }[] = [];
  const seen = new Set<string>();
  for (const art of angebotsartenFor(p)) {
    for (const term of terms) {
      const q = buildBaQuery(term, p, art);
      let data: { stellenangebote?: BaListItem[] };
      try {
        data = await getJson(`${BASE}/pc/v4/app/jobs?${q}`, f);
      } catch {
        data = await getJson(`${BASE}/pc/v6/jobs?${q}`, f); // newer endpoint as fallback
      }
      for (const item of data.stellenangebote ?? []) {
        const ref = item.refnr ?? item.referenznummer;
        if (ref && !seen.has(ref)) {
          seen.add(ref);
          listed.push({ item, art });
        }
      }
    }
  }
  const results = await pool(listed, 6, async ({ item, art }, idx) => {
    const ref = (item.refnr ?? item.referenznummer)!;
    let detail: BaDetail | null = null;
    if (idx < maxDetails) {
      try {
        detail = await getJson<BaDetail>(`${BASE}/pc/v4/jobdetails/${Buffer.from(ref).toString("base64")}`, f);
      } catch {
        detail = null; // keep listing; description links to original
      }
    }
    return mapBa(item, detail, art);
  });
  return results.filter((j): j is RawJob => j !== null);
}
