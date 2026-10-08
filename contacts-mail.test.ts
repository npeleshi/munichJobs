import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyEmail, deobfuscate, detectAts, extractEmails, isJobBoard, portalOnly, registrableDomain } from "../src/lib/contacts/extract";
import { robotsAllows } from "../src/lib/contacts/robots";
import { buildMime, encodeHeader, filenameParams, EMAIL_SYNTAX } from "../src/lib/mail/mime";
import { factCheck } from "../src/lib/mail/factcheck";
import { quickScore, germanRequirement } from "../src/lib/cv/quickscore";
import { rateLimit } from "../src/lib/ratelimit";
import type { CvProfile } from "../src/lib/cv/profile";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
const { encryptString, decryptString, encryptBuffer, decryptBuffer } = await import("../src/lib/crypto");

test("e-mail classification prefers recruiters and careers inboxes, excludes privacy/noreply", () => {
  const found = extractEmails(`
    Ihre Ansprechpartnerin: Anna Schmidt, anna.schmidt@acme.de
    Bewerbungen bitte an bewerbung@acme.de.
    Allgemein: info@acme.de · Datenschutz: datenschutz@acme.de · noreply@acme.de
    logo@2x.png
  `);
  assert.deepEqual(found.map((f) => [f.email, f.kind]), [
    ["anna.schmidt@acme.de", "named_recruiter"],
    ["bewerbung@acme.de", "careers"],
    ["info@acme.de", "general"],
  ]);
  assert.equal(found[0].personName, "Anna Schmidt");
});

test("obfuscated addresses are decoded, never constructed", () => {
  assert.equal(deobfuscate("jobs [at] acme [dot] de"), "jobs@acme.de");
  assert.equal(deobfuscate("karriere(at)acme.de"), "karriere@acme.de");
  assert.deepEqual(extractEmails("Kontakt: jobs [at] acme [dot] de").map((e) => e.email), ["jobs@acme.de"]);
  // A name alone produces nothing – we don't guess firstname.lastname@
  assert.deepEqual(extractEmails("Ansprechpartner: Max Mustermann, Acme GmbH"), []);
});

test("person address without recruiting context is labelled general", () => {
  assert.deepEqual(classifyEmail("max.mustermann@acme.de", "Geschäftsführer: Max Mustermann"), { kind: "general", personName: "Max Mustermann" });
  assert.equal(classifyEmail("jobs@arbeitsagentur.de", ""), null);
});

test("ATS / portal detection", () => {
  assert.equal(detectAts("https://acme.jobs.personio.de/job/123"), "Personio");
  assert.equal(detectAts("https://boards.greenhouse.io/acme/jobs/1"), "Greenhouse");
  assert.equal(detectAts("https://acme.de/karriere"), null);
  assert.equal(portalOnly("Bitte bewerben Sie sich ausschließlich über unser Online-Bewerbungsportal."), true);
  assert.equal(portalOnly("Bewerbungen per E-Mail können leider nicht berücksichtigt werden."), true);
  assert.equal(portalOnly("Schicken Sie uns Ihre Unterlagen."), false);
  assert.equal(isJobBoard("https://www.stepstone.de/x"), true);
  assert.equal(isJobBoard("https://www.acme.de"), false);
  assert.equal(registrableDomain("karriere.acme.de"), "acme.de");
  assert.equal(registrableDomain("jobs.acme.co.uk"), "acme.co.uk");
});

test("robots.txt evaluation (longest match, wildcards, specific agent group)", () => {
  const txt = "User-agent: *\nDisallow: /private\nAllow: /private/jobs\nDisallow: /*.pdf$\n\nUser-agent: BadBot\nDisallow: /";
  assert.equal(robotsAllows(txt, "/karriere"), true);
  assert.equal(robotsAllows(txt, "/private/x"), false);
  assert.equal(robotsAllows(txt, "/private/jobs/1"), true);
  assert.equal(robotsAllows(txt, "/doc.pdf"), false);
  assert.equal(robotsAllows(txt, "/karriere", "BadBot"), false);
  assert.equal(robotsAllows("", "/x"), true);
});

test("MIME message: UTF-8 subject, attachment round-trip, header injection blocked", () => {
  const pdf = Buffer.from("%PDF-1.4 fake cv bytes äöü");
  const mime = buildMime({ to: "jobs@acme.de", subject: "Bewerbung als Business Development Manager – Jörg", text: "Sehr geehrte Damen und Herren,\nanbei …", attachments: [{ filename: "Lebenslauf Jörg.pdf", mimeType: "application/pdf", content: pdf }] });
  assert.match(mime, /^To: jobs@acme\.de\r\n/);
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  assert.match(mime, /filename\*=UTF-8''Lebenslauf%20J%C3%B6rg\.pdf/);
  const b64 = mime.split("Content-Transfer-Encoding: base64\r\n\r\n")[2].split("\r\n--")[0].replace(/\r\n/g, "");
  assert.deepEqual(Buffer.from(b64, "base64"), pdf);
  assert.throws(() => buildMime({ to: "a@b.de\r\nBcc: evil@x.com", subject: "x", text: "", attachments: [] }), /injection/);
  assert.equal(encodeHeader("plain"), "plain");
  assert.equal(filenameParams("cv.pdf"), 'filename="cv.pdf"');
  assert.ok(EMAIL_SYNTAX.test("anna.schmidt@acme.de"));
  assert.ok(!EMAIL_SYNTAX.test("anna schmidt@acme"));
});

test("AES-GCM encryption round-trips and detects tampering", () => {
  const s = encryptString("Lebenslauf – vertraulich");
  assert.notEqual(s, "Lebenslauf – vertraulich");
  assert.equal(decryptString(s), "Lebenslauf – vertraulich");
  const blob = encryptBuffer(Buffer.from("cv"));
  blob[blob.length - 1] ^= 1;
  assert.throws(() => decryptBuffer(blob));
});

test("fact-check flags invented numbers and clichés, accepts CV facts", () => {
  const cv = "Increased B2B revenue by 35% at Foo GmbH. 6 years in SaaS sales.";
  const job = { title: "Business Development Manager (m/w/d)", company: "Acme GmbH", description: "Erfahrung 5 Jahre" };
  const ok = factCheck({ subject: "Bewerbung als Business Development Manager", body: "Bei Acme … Umsatz um 35% gesteigert, 6 years." }, cv, job, ["passionate"]);
  assert.equal(ok.length, 0);
  const bad = factCheck({ subject: "Application", body: "I am passionate and grew revenue by 40% for Acme as Business Development Manager." }, cv, job, ["passionate"]);
  assert.deepEqual(bad.map((w) => w.kind).sort(), ["cliche", "unverified_number"]);
  const ph = factCheck({ subject: "Business Development Manager", body: "Dear [Name], Acme" }, cv, job);
  assert.ok(ph.some((w) => w.kind === "placeholder"));
});

const profile: CvProfile = {
  name: "Test", email: null, phone: null, location: "München", headline: "Business Development Manager", seniority: "mid", totalYearsExperience: 6,
  education: [], experience: [{ title: "Business Development Manager", company: "Foo", start: null, end: null, highlights: [] }],
  skills: ["Salesforce", "B2B sales", "Negotiation", "SaaS", "CRM", "Lead generation"], languages: [{ language: "English", level: "C2" }, { language: "German", level: "B1" }],
  certifications: [], projects: [], industries: ["SaaS"], careerInterests: [], achievements: [],
};

test("quick score rewards title/skill overlap and penalises unmet fluent-German requirement", () => {
  const job = { title: "Business Development Manager", description: "B2B sales of our SaaS platform using Salesforce and CRM; lead generation; negotiation." };
  const s1 = quickScore(profile, job);
  const s2 = quickScore(profile, { ...job, description: job.description + " Verhandlungssichere Deutschkenntnisse (C1) erforderlich." });
  assert.ok(s1.score >= 80, `expected high score, got ${s1.score}`);
  assert.equal(s2.germanRequired, true);
  assert.equal(s2.germanOk, false);
  assert.ok(s2.score < s1.score * 0.7);
  assert.ok(quickScore(profile, { title: "Pflegefachkraft", description: "Pflege von Patienten" }).score < 15);
  assert.equal(germanRequirement("Fluent German is a must"), true);
});

test("rate limiter blocks after the limit within the window", () => {
  const t = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit("k", 3, 1000, t + i).ok, true);
  assert.equal(rateLimit("k", 3, 1000, t + 10).ok, false);
  assert.equal(rateLimit("k", 3, 1000, t + 2000).ok, true);
});
