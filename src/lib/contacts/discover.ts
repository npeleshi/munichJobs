// Recruitment-contact discovery from *public* sources only:
//   1. the job advertisement text
//   2. the original listing / application page
//   3. the employer's own website (careers, contact and Impressum pages)
// We respect robots.txt, identify ourselves, never log in, never solve CAPTCHAs
// and never construct addresses from name patterns.
import { promises as dns } from "node:dns";
import { prisma } from "../db";
import { logger } from "../logger";
import { htmlToText } from "../jobs/normalize";
import { robotsAllows } from "./robots";
import { detectAts, domainOf, extractEmails, isJobBoard, portalOnly, rank, registrableDomain, type ContactKind } from "./extract";

const UA = "MunichJobAssistant/1.0 (+personal job-search assistant; respects robots.txt)";
const robotsCache = new Map<string, string | null>();

async function allowed(url: URL): Promise<boolean> {
  const origin = url.origin;
  if (!robotsCache.has(origin)) {
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
      robotsCache.set(origin, r.ok ? await r.text() : null);
    } catch {
      robotsCache.set(origin, null);
    }
  }
  const txt = robotsCache.get(origin);
  return txt ? robotsAllows(txt, url.pathname + url.search, "MunichJobAssistant") : true;
}

async function fetchPage(u: string, hops = 0): Promise<{ html: string; url: string } | null> {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || hops > 4) return null;
  if (!(await isPublicHost(url.hostname))) return null; // SSRF guard (checked on every redirect hop)
  if (!(await allowed(url))) {
    logger.info("robots.txt disallows", { url: url.origin + url.pathname });
    return null;
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      return fetchPage(new URL(res.headers.get("location")!, url).toString(), hops + 1);
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    return { html, url: url.toString() };
  } catch {
    return null;
  }
}

function findLinks(html: string, base: string, re: RegExp): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = htmlToText(m[2]).toLowerCase();
    if (re.test(label) || re.test(m[1].toLowerCase())) {
      try {
        const abs = new URL(m[1], base);
        if (abs.hostname === new URL(base).hostname) out.add(abs.toString());
      } catch {
        /* ignore */
      }
    }
  }
  return [...out].slice(0, 3);
}

/** mailto: links carry the cleanest address; add them to the text before scanning. */
const withMailtos = (html: string) => html + "\n" + [...html.matchAll(/mailto:([^"'?>\s]+)/gi)].map((m) => decodeURIComponent(m[1])).join("\n");

/** Refuse to fetch hosts that resolve to private / loopback / link-local ranges. */
async function isPublicHost(host: string): Promise<boolean> {
  try {
    const addrs = await dns.lookup(host, { all: true });
    return addrs.every(({ address: a }) =>
      !/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(a) &&
      !/^(::1|fc|fd|fe80|::ffff:(10|127|192\.168)\.)/i.test(a));
  } catch {
    return false;
  }
}

async function hasMx(domain: string): Promise<boolean | null> {
  try {
    return (await dns.resolveMx(domain)).length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return code === "ENOTFOUND" || code === "ENODATA" ? false : null;
  }
}

interface Candidate {
  email: string;
  kind: ContactKind;
  personName: string | null;
  sourceUrl: string;
  sourceLabel: string;
}

export async function discoverContacts(jobId: string) {
  const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
  const found: Candidate[] = [];
  const add = (text: string, sourceUrl: string, sourceLabel: string, restrictDomain?: string) => {
    for (const e of extractEmails(text)) {
      if (restrictDomain && registrableDomain(e.email.split("@")[1]) !== restrictDomain) continue;
      found.push({ email: e.email, kind: e.kind, personName: e.personName, sourceUrl, sourceLabel });
    }
  };

  // 1. Job advertisement text (already retrieved from the source API)
  add(job.description, job.url, "Job advertisement");
  let adText = job.description;

  // 2. Original application page (employer site or ATS posting)
  const pages: string[] = [];
  if (job.applyUrl && !/adzuna\./i.test(job.applyUrl)) pages.push(job.applyUrl);
  for (const u of pages) {
    const p = await fetchPage(u);
    if (!p) continue;
    const txt = htmlToText(withMailtos(p.html));
    adText += "\n" + txt;
    add(txt, p.url, detectAts(p.url) ? `Application page (${detectAts(p.url)})` : "Original job posting");
  }

  // 3. Employer website: careers → contact → Impressum (legally required contact)
  const siteUrl = job.companyWebsite ?? (job.applyUrl && !isJobBoard(job.applyUrl) ? new URL(job.applyUrl).origin : null);
  const siteDomain = siteUrl ? domainOf(siteUrl) : null;
  if (siteUrl && siteDomain && !isJobBoard(siteUrl)) {
    const root = registrableDomain(siteDomain);
    const home = await fetchPage(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`);
    if (home) {
      add(htmlToText(withMailtos(home.html)), home.url, "Company website", root);
      const careerLinks = findLinks(home.html, home.url, /karriere|career|jobs|stellen|join us|arbeiten bei/);
      const contactLinks = findLinks(home.html, home.url, /kontakt|contact|impressum|imprint|legal notice/);
      for (const l of careerLinks) {
        const p = await fetchPage(l);
        if (p) add(htmlToText(withMailtos(p.html)), p.url, "Company careers page", root);
      }
      if (!found.some((f) => f.kind !== "general")) {
        for (const l of contactLinks) {
          const p = await fetchPage(l);
          if (p) add(htmlToText(withMailtos(p.html)), p.url, /impressum|imprint/i.test(l) ? "Company Impressum" : "Company contact page", root);
        }
      }
    }
  }

  // De-duplicate: keep best classification + earliest (most specific) source.
  const best = new Map<string, Candidate>();
  for (const c of found) {
    const prev = best.get(c.email);
    if (!prev || rank(c.kind) > rank(prev.kind)) best.set(c.email, c);
  }
  const contacts = [...best.values()].sort((a, b) => rank(b.kind) - rank(a.kind)).slice(0, 6);

  const mx = new Map<string, boolean | null>();
  for (const c of contacts) {
    const d = c.email.split("@")[1];
    if (!mx.has(d)) mx.set(d, await hasMx(d));
  }
  const usable = contacts.filter((c) => mx.get(c.email.split("@")[1]) !== false);

  await prisma.$transaction([
    prisma.contact.deleteMany({ where: { jobId } }),
    ...usable.map((c) => prisma.contact.create({ data: { jobId, ...c, mxValid: mx.get(c.email.split("@")[1]) ?? null } })),
    prisma.job.update({
      where: { id: jobId },
      data: {
        contactStatus: usable.some((c) => c.kind !== "general") ? "found" : usable.length ? "general_only" : "not_found",
        contactCheckedAt: new Date(),
        atsVendor: job.atsVendor ?? detectAts(job.applyUrl, job.url) ?? (portalOnly(adText) ? "Online portal (per job ad)" : null),
      },
    }),
  ]);
  return prisma.job.findUniqueOrThrow({ where: { id: jobId }, include: { contacts: true } });
}
