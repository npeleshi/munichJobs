// Platforms without a public API (or whose terms forbid automated extraction).
// We never scrape them – we generate pre-filled official search links instead.
import type { DeepLink, SearchParams } from "../types";

export function deepLinks(p: SearchParams): DeepLink[] {
  const term = p.titles[0] ?? "";
  const e = encodeURIComponent;
  const loc = p.location || "München";
  const r = p.radiusKm;
  const days = p.publishedWithinDays;
  const slug = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    { source: "linkedin", label: "LinkedIn Jobs", url: `https://www.linkedin.com/jobs/search/?keywords=${e(term)}&location=${e(loc + ", Bavaria, Germany")}&distance=${Math.round(r / 1.609)}${days ? `&f_TPR=r${days * 86400}` : ""}`, reason: "No public job-search API; automated access is prohibited by LinkedIn's terms." },
    { source: "indeed", label: "Indeed Deutschland", url: `https://de.indeed.com/jobs?q=${e(term)}&l=${e(loc)}&radius=${r}${days ? `&fromage=${days}` : ""}`, reason: "Indeed's publisher API is closed to new partners; scraping is not permitted." },
    { source: "stepstone", label: "StepStone", url: `https://www.stepstone.de/jobs/${slug(term)}/in-${slug(loc)}?radius=${r}`, reason: "No public API." },
    { source: "xing", label: "XING Jobs", url: `https://www.xing.com/jobs/search?keywords=${e(term)}&location=${e(loc)}&radius=${r}`, reason: "No public API." },
    { source: "glassdoor", label: "Glassdoor", url: `https://www.glassdoor.de/Job/jobs.htm?sc.keyword=${e(term)}&locKeyword=${e(loc)}`, reason: "No public API; content requires login." },
    { source: "jobware", label: "Jobware", url: `https://www.jobware.de/jobsuche?jw_jobname=${e(term)}&jw_jobort=${e(loc)}&jw_ort_distance=${r}`, reason: "No public API." },
    { source: "google", label: "Google Jobs (company career sites)", url: `https://www.google.com/search?q=${e(`${term} jobs ${loc}`)}&ibp=htl;jobs`, reason: "Aggregates company career pages; no public API." },
  ];
}
