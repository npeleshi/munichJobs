import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, dedupe, detectLanguage, fingerprint, htmlToText, inferExperience, inferWorkMode, isInArea, matchesTerms, parseSalary } from "../src/lib/jobs/normalize";
import { expandTitles } from "../src/lib/jobs/expand";
import { buildBaQuery, mapBa, searchArbeitsagentur, angebotsartenFor } from "../src/lib/jobs/sources/arbeitsagentur";
import { mapArbeitnow, searchArbeitnow } from "../src/lib/jobs/sources/arbeitnow";
import { mapAdzuna } from "../src/lib/jobs/sources/adzuna";
import { deepLinks } from "../src/lib/jobs/sources/deeplinks";
import type { RawJob, SearchParams } from "../src/lib/jobs/types";

const P: SearchParams = { titles: ["Business Development Manager"], language: "both", expand: true, location: "München", radiusKm: 25, employment: [], workModes: [], experience: [], minSalary: null, industry: null, publishedWithinDays: 30, sort: "match" };

const raw = (o: Partial<RawJob>): RawJob => ({ source: "arbeitsagentur", externalId: "1", title: "Business Development Manager (m/w/d)", company: "Acme GmbH", location: "80331 München", employment: [], description: "x", url: "https://a", ...o });

test("htmlToText strips tags, decodes entities, keeps structure", () => {
  const t = htmlToText("<p>Ihre Aufgaben&nbsp;&amp; Profil</p><ul><li>B2B&#8209;Vertrieb</li><li>Gr&ouml;&szlig;e</li></ul><script>x()</script>");
  assert.match(t, /Ihre Aufgaben & Profil/);
  assert.match(t, /• B2B‑Vertrieb/);
  assert.match(t, /Größe/);
  assert.doesNotMatch(t, /x\(\)/);
});

test("fingerprint ignores gender suffixes, legal forms and postcodes", () => {
  const a = fingerprint({ title: "Business Development Manager (m/w/d)", company: "Acme GmbH", location: "80331 München" });
  const b = fingerprint({ title: "Business Development Manager (all genders)", company: "ACME", location: "Munich, Bavaria" });
  assert.equal(a, b);
});

test("dedupe merges the same vacancy from two sources and keeps richest data", () => {
  const merged = dedupe([
    raw({ source: "arbeitsagentur", externalId: "10000-1", description: "short", url: "https://ba" }),
    raw({ source: "arbeitnow", externalId: "acme-bdm", title: "Business Development Manager (w/m/d)", company: "Acme", location: "Munich", description: "a much longer description of the role", salaryText: "70.000 €", url: "https://an" }),
    raw({ externalId: "2", title: "Sales Manager", url: "https://other" }),
  ]);
  assert.equal(merged.length, 2);
  const m = merged.find((x) => x.title.startsWith("Business"))!;
  assert.equal(m.sources.length, 2);
  assert.equal(m.description, "a much longer description of the role");
  assert.equal(m.salaryText, "70.000 €");
});

test("experience, work mode, language inference", () => {
  assert.equal(inferExperience("Senior Business Development Manager"), "senior");
  assert.equal(inferExperience("Werkstudent Business Development"), "student");
  assert.equal(inferExperience("Head of Business Development"), "lead");
  assert.equal(inferExperience("Junior Sales Manager"), "entry");
  assert.equal(inferWorkMode("Wir bieten hybrides Arbeiten mit 2 Tage Homeoffice"), "hybrid");
  assert.equal(inferWorkMode("This is a fully remote position"), "remote");
  assert.equal(inferWorkMode("Büro im Werksviertel"), null);
  assert.equal(detectLanguage("Ihre Aufgaben: Sie bauen mit uns und unser Team die Kunden auf"), "de");
  assert.equal(detectLanguage("You will work with our team and your skills and experience"), "en");
});

test("parseSalary handles German and shorthand formats", () => {
  assert.deepEqual(parseSalary("60.000 – 75.000 € brutto p.a."), { min: 60000, max: 75000 });
  assert.deepEqual(parseSalary("ab €55k"), { min: 55000, max: 55000 });
  assert.deepEqual(parseSalary("nach Vereinbarung"), { min: null, max: null });
  assert.deepEqual(parseSalary("Entgeltgruppe 13 TV-L"), { min: null, max: null });
});

test("area check uses coordinates when present, place names otherwise", () => {
  assert.equal(isInArea({ location: "Garching", lat: 48.249, lon: 11.651 }, 25), true);
  assert.equal(isInArea({ location: "Berlin", lat: 52.52, lon: 13.40 }, 25), false);
  assert.equal(isInArea({ location: "Unterschleißheim, Germany" }, 25), true);
  assert.equal(isInArea({ location: "Hamburg" }, 25), false);
});

test("matchesTerms is tolerant to word order but not to unrelated titles", () => {
  assert.equal(matchesTerms({ title: "Manager Business Development (m/w/d)", description: "" }, ["Business Development Manager"]), true);
  assert.equal(matchesTerms({ title: "Software Engineer", description: "" }, ["Business Development Manager"]), false);
});

test("applyFilters: employment, work mode, salary, date", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const jobs = [
    raw({ externalId: "a", employment: ["full_time"], workMode: "hybrid", salaryMax: 80000, postedAt: new Date("2026-10-01") }),
    raw({ externalId: "b", employment: ["part_time"], workMode: null, postedAt: new Date("2026-10-07") }),
    raw({ externalId: "c", employment: ["full_time"], workMode: "remote", salaryMax: 40000, postedAt: new Date("2026-06-01") }),
  ];
  assert.deepEqual(applyFilters(jobs, { ...P, publishedWithinDays: 0, employment: ["full_time"] }, now).map((j) => j.externalId), ["a", "c"]);
  assert.deepEqual(applyFilters(jobs, { ...P, publishedWithinDays: 0, workModes: ["onsite"] }, now).map((j) => j.externalId), ["b"]);
  assert.deepEqual(applyFilters(jobs, { ...P, publishedWithinDays: 0, minSalary: 60000 }, now).map((j) => j.externalId), ["a", "b"]);
  assert.deepEqual(applyFilters(jobs, { ...P, publishedWithinDays: 30 }, now).map((j) => j.externalId), ["a", "b"]);
});

test("title expansion adds German equivalents for BDM", () => {
  const t = expandTitles(["Business Development Manager"], "both");
  assert.ok(t.includes("Business Development Manager"));
  assert.ok(t.some((x) => /Geschäftsentwicklung/.test(x)));
  assert.ok(!expandTitles(["Business Development Manager"], "en").some((x) => /Geschäftsentwicklung/.test(x)));
});

test("Arbeitsagentur query builder maps filters to API params", () => {
  const q = buildBaQuery("Business Development Manager (m/w/d)", { ...P, employment: ["full_time", "part_time"], workModes: ["remote", "hybrid"], radiusKm: 30, publishedWithinDays: 14 }, 1);
  assert.equal(q.get("was"), "Business Development Manager");
  assert.equal(q.get("wo"), "München");
  assert.equal(q.get("umkreis"), "30");
  assert.equal(q.get("arbeitszeit"), "vz;tz;ho");
  assert.equal(q.get("veroeffentlichtseit"), "14");
  assert.deepEqual(angebotsartenFor({ ...P, employment: ["internship"] }), [34]);
  assert.deepEqual(angebotsartenFor(P), [1]);
});

test("Arbeitsagentur mapping uses details for description, salary, website", () => {
  const j = mapBa(
    { refnr: "10001-1002716922-S", titel: "BDM", arbeitgeber: "Acme GmbH", aktuelleVeroeffentlichungsdatum: "2026-10-01", arbeitsort: { plz: "80331", ort: "München", koordinaten: { lat: 48.13, lon: 11.57 } }, externeUrl: "https://acme.jobs.personio.de/job/1" },
    { stellenangebotsTitel: "Business Development Manager (m/w/d)", stellenangebotsBeschreibung: "<p>Ihre Aufgaben</p>", verguetung: "65.000 - 80.000 EUR", arbeitszeitmodelle: ["VOLLZEIT", "HEIM_TELEARBEIT"], branche: "Software", arbeitgeberdarstellungUrl: "https://acme.de" },
    1,
  )!;
  assert.equal(j.title, "Business Development Manager (m/w/d)");
  assert.equal(j.url, "https://www.arbeitsagentur.de/jobsuche/jobdetail/10001-1002716922-S");
  assert.equal(j.applyUrl, "https://acme.jobs.personio.de/job/1");
  assert.equal(j.companyWebsite, "https://acme.de");
  assert.deepEqual([j.salaryMin, j.salaryMax], [65000, 80000]);
  assert.deepEqual(j.employment, ["full_time"]);
  assert.equal(j.workMode, "hybrid");
  assert.equal(j.description, "Ihre Aufgaben");
});

test("searchArbeitsagentur: list + base64 detail calls, dedupe by refnr, sends API key", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    assert.equal((init?.headers as Record<string, string>)["X-API-Key"], "jobboerse-jobsuche");
    if (url.includes("/jobs?")) {
      return new Response(JSON.stringify({ stellenangebote: [
        { refnr: "R-1", titel: "Business Development Manager", arbeitgeber: "A GmbH", arbeitsort: { ort: "München" } },
        { refnr: "R-1", titel: "dup", arbeitgeber: "A GmbH", arbeitsort: { ort: "München" } },
      ] }));
    }
    if (url.includes("/jobdetails/" + Buffer.from("R-1").toString("base64"))) {
      return new Response(JSON.stringify({ stellenangebotsBeschreibung: "Beschreibung", arbeitszeitmodelle: ["VOLLZEIT"] }));
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const jobs = await searchArbeitsagentur(["Business Development Manager"], P, fakeFetch);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].description, "Beschreibung");
  assert.ok(calls[0].startsWith("https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs?"));
});

test("searchArbeitsagentur surfaces HTTP errors instead of returning fake data", async () => {
  const failing = (async () => new Response("err", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(searchArbeitsagentur(["X"], P, failing), /Arbeitsagentur HTTP 503/);
});

test("Arbeitnow: paginates, keeps only Munich-area matching titles", async () => {
  const page = (n: number) => ({
    data: [
      { slug: `bdm-${n}`, company_name: "Acme", title: "Business Development Manager", description: "<p>Hybrid role</p>", remote: false, url: `https://www.arbeitnow.com/jobs/bdm-${n}`, location: n === 1 ? "Munich" : "Berlin", created_at: 1759900000, job_types: ["Full Time"] },
      { slug: `dev-${n}`, company_name: "Beta", title: "Frontend Developer", description: "", remote: false, url: "https://x", location: "Munich", created_at: 1759900000 },
    ],
    links: { next: n < 2 ? "next" : null },
  });
  let n = 0;
  const f = (async () => new Response(JSON.stringify(page(++n)))) as unknown as typeof fetch;
  const jobs = await searchArbeitnow(["Business Development Manager"], P, f, 5);
  assert.equal(n, 2);
  assert.deepEqual(jobs.map((j) => j.externalId), ["bdm-1"]);
  assert.deepEqual(jobs[0].employment, ["full_time"]);
  assert.equal(mapArbeitnow({ ...page(1).data[0], remote: true }).workMode, "remote");
});

test("Adzuna mapping never shows predicted salaries as real", () => {
  const base = { id: "1", title: "<strong>BDM</strong>", description: "desc", created: "2026-10-01T00:00:00Z", redirect_url: "https://adzuna/1", company: { display_name: "Acme" }, location: { display_name: "München" }, salary_min: 60000, salary_max: 70000 };
  assert.equal(mapAdzuna({ ...base, salary_is_predicted: "1" }).salaryText, null);
  assert.equal(mapAdzuna({ ...base, salary_is_predicted: "0" }).salaryMin, 60000);
  assert.equal(mapAdzuna(base).title, "BDM");
});

test("deep links are generated for restricted platforms and say why", () => {
  const links = deepLinks(P);
  assert.ok(links.find((l) => l.source === "linkedin")!.url.includes("keywords=Business%20Development%20Manager"));
  assert.ok(links.find((l) => l.source === "stepstone")!.url.includes("/jobs/business-development-manager/in-muenchen"));
  assert.ok(links.every((l) => l.reason.length > 5));
});
