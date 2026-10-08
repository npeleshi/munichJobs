// Pure helpers for normalising, classifying, filtering and de-duplicating vacancies.
// No runtime imports – unit-tested with plain Node.
import type { EmploymentType, Experience, RawJob, SearchParams, WorkMode } from "./types";

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", euro: "€", ndash: "–", mdash: "—", bull: "•",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|ul|ol)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e] ?? m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/\((m|w|d|f|x|div|all genders?|gn\*?)[^)]*\)/g, " ") // (m/w/d), (all genders)
    .replace(/\b(m\/w\/d|w\/m\/d|m\/f\/d|f\/m\/d|m\/w\/x|all genders?)\b/g, " ")
    .replace(/\b(gmbh|ag|se|kg|co|mbh|ug|inc|ltd|llc|e\.?v\.?|holding|group|deutschland|germany)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function cityKey(location: string): string {
  const k = normalizeKey(location);
  if (/muenchen|munich|munchen/.test(k)) return "muenchen";
  return k.split(" ").filter((w) => !/^\d+$/.test(w))[0] ?? k;
}

export function fingerprint(j: Pick<RawJob, "title" | "company" | "location">): string {
  return `${normalizeKey(j.company)}|${normalizeKey(j.title)}|${cityKey(j.location)}`;
}

export function inferExperience(title: string): Experience | null {
  const t = title.toLowerCase();
  if (/werkstudent|working student|praktik|intern\b|internship|abschlussarbeit|thesis|azubi|ausbildung/.test(t)) return "student";
  if (/\b(head of|director|leiter|leitung|vp\b|vice president|chief|cxo|principal|lead\b|teamlead|team lead)/.test(t)) return "lead";
  if (/\b(senior|sr\.?|erfahren)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|einsteiger|berufseinsteiger|graduate|trainee|entry)\b/.test(t)) return "entry";
  return "mid";
}

export function inferWorkMode(text: string): WorkMode | null {
  const t = text.toLowerCase();
  if (/\bhybrid|teilweise (remote|homeoffice|home-office)|\d+ tage? (im )?(homeoffice|home office|remote)/.test(t)) return "hybrid";
  if (/\b(100\s?% remote|fully remote|full remote|vollständig remote|remote-first|remote only)\b/.test(t)) return "remote";
  if (/\b(remote|homeoffice|home-office|home office|mobiles arbeiten)\b/.test(t)) return "hybrid";
  return null;
}

export function inferEmploymentFromText(text: string): EmploymentType[] {
  const t = text.toLowerCase();
  const out = new Set<EmploymentType>();
  if (/werkstudent|working student/.test(t)) out.add("working_student");
  if (/praktik|internship|\bintern\b/.test(t)) out.add("internship");
  if (/teilzeit|part[- ]time/.test(t)) out.add("part_time");
  if (/vollzeit|full[- ]time/.test(t)) out.add("full_time");
  if (/minijob|mini-job/.test(t)) out.add("mini_job");
  if (/ausbildung|apprentice/.test(t)) out.add("apprenticeship");
  return [...out];
}

const DE_WORDS = /\b(und|wir|sie|für|mit|der|die|das|ihre|unser|bei|eine|aufgaben|profil|kenntnisse)\b/gi;
const EN_WORDS = /\b(and|we|you|for|with|the|your|our|at|a|responsibilities|requirements|skills|experience)\b/gi;

export function detectLanguage(text: string): "de" | "en" {
  const sample = text.slice(0, 4000);
  const de = (sample.match(DE_WORDS) ?? []).length;
  const en = (sample.match(EN_WORDS) ?? []).length;
  return de >= en ? "de" : "en";
}

/** Parses German/English salary snippets like "60.000 – 75.000 € p.a." or "€55k". */
export function parseSalary(s: string | null | undefined): { min: number | null; max: number | null } {
  if (!s) return { min: null, max: null };
  const nums = [...s.matchAll(/(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|tsd|t€)?/gi)]
    .map((m) => {
      let n = parseFloat(m[1].replace(/[.\s](?=\d{3}\b)/g, "").replace(",", "."));
      if (m[2]) n *= 1000;
      return n;
    })
    .filter((n) => n >= 1000 && n < 1_000_000);
  if (!nums.length) return { min: null, max: null };
  return { min: Math.round(Math.min(...nums)), max: Math.round(Math.max(...nums)) };
}

export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export const MUNICH = { lat: 48.1374, lon: 11.5755 };

// Places within the greater Munich area, used when a source has no coordinates.
const MUNICH_AREA = /m(ü|ue|u)nchen|munich|garching|unterschlei(ß|ss)heim|ismaning|unterf(ö|oe)hring|aschheim|feldkirchen|haar|gr(ü|ue)nwald|pullach|planegg|martinsried|gr(ä|ae)felfing|germering|puchheim|dachau|freising|erding|ottobrunn|neubiberg|taufkirchen|oberhaching|unterhaching|starnberg|f(ü|ue)rstenfeldbruck|hallbergmoos|oberschlei(ß|ss)heim|kirchheim|poing|vaterstetten|gilching|we(ß|ss)ling|oberpfaffenhofen/i;

export function isInArea(j: Pick<RawJob, "location" | "lat" | "lon" | "workMode">, radiusKm: number, center = MUNICH): boolean {
  if (j.lat != null && j.lon != null) return haversineKm(center, { lat: j.lat, lon: j.lon }) <= radiusKm + 0.5;
  if (MUNICH_AREA.test(j.location)) return true;
  return false;
}

/** Does the title (or description) plausibly match one of the search terms? */
export function matchesTerms(j: Pick<RawJob, "title" | "description">, terms: string[]): boolean {
  const title = normalizeKey(j.title);
  return terms.some((term) => {
    const words = normalizeKey(term).split(" ").filter((w) => w.length > 2);
    if (!words.length) return false;
    const hits = words.filter((w) => title.includes(w)).length;
    return hits / words.length >= 0.6;
  });
}

export function applyFilters(jobs: RawJob[], p: SearchParams, now = new Date()): RawJob[] {
  return jobs.filter((j) => {
    if (p.employment.length) {
      const emp = j.employment.length ? j.employment : inferEmploymentFromText(`${j.title}`);
      // jobs without known employment type are kept only when "full_time" is asked (most common default)
      if (emp.length ? !emp.some((e) => p.employment.includes(e)) : !p.employment.includes("full_time")) return false;
    }
    if (p.workModes.length) {
      const wm = j.workMode ?? "onsite";
      if (!p.workModes.includes(wm)) return false;
    }
    if (p.experience.length) {
      const ex = inferExperience(j.title);
      if (ex && !p.experience.includes(ex)) return false;
    }
    if (p.minSalary && j.salaryMax != null && j.salaryMax < p.minSalary) return false;
    if (p.industry && j.industry && !normalizeKey(j.industry).includes(normalizeKey(p.industry))) return false;
    if (p.publishedWithinDays && j.postedAt) {
      if (now.getTime() - j.postedAt.getTime() > p.publishedWithinDays * 86400_000 + 86400_000) return false;
    }
    return true;
  });
}

export interface MergedJob extends RawJob {
  fingerprint: string;
  sources: { source: string; externalId: string; url: string }[];
}

/** Merge vacancies that appear on several sources, keeping the richest data. */
export function dedupe(jobs: RawJob[]): MergedJob[] {
  const map = new Map<string, MergedJob>();
  for (const j of jobs) {
    const fp = fingerprint(j);
    const existing = map.get(fp);
    const src = { source: j.source, externalId: j.externalId, url: j.url };
    if (!existing) {
      map.set(fp, { ...j, fingerprint: fp, sources: [src] });
      continue;
    }
    if (!existing.sources.some((s) => s.source === src.source && s.externalId === src.externalId)) existing.sources.push(src);
    if (j.description.length > existing.description.length) existing.description = j.description;
    existing.salaryText ??= j.salaryText;
    existing.salaryMin ??= j.salaryMin;
    existing.salaryMax ??= j.salaryMax;
    existing.lat ??= j.lat;
    existing.lon ??= j.lon;
    existing.workMode ??= j.workMode;
    existing.industry ??= j.industry;
    existing.applyUrl ??= j.applyUrl;
    existing.companyWebsite ??= j.companyWebsite;
    existing.employment = [...new Set([...existing.employment, ...j.employment])];
    if (j.postedAt && (!existing.postedAt || j.postedAt > existing.postedAt)) existing.postedAt = j.postedAt;
  }
  return [...map.values()];
}

export function summarize(text: string, max = 320): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}
