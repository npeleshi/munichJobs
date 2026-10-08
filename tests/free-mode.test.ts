import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicProfile, parseLanguages } from "../src/lib/cv/heuristic";
import { templateDraft, relevantSkills } from "../src/lib/mail/template";
import { quickScore } from "../src/lib/cv/quickscore";

const CV = `Ardit Hoxha
ardit.hoxha@example.com · +49 170 1234567
Business Development Manager
Berufserfahrung
2018 – heute  Business Development Manager, Foo GmbH
Skills
B2B sales, Salesforce, Contract negotiation, Market analysis
Sprachen
Deutsch C1
English C2
Albanian native`;

test("heuristic profile extracts only what is in the CV", () => {
  const p = heuristicProfile(CV);
  assert.equal(p.name, "Ardit Hoxha");
  assert.equal(p.email, "ardit.hoxha@example.com");
  assert.ok(p.skills.includes("Salesforce"));
  assert.deepEqual(p.languages.map((l) => [l.language, l.level]), [["German", "C1"], ["English", "C2"], ["Albanian", "native"]]);
  assert.deepEqual(p.achievements, []);
  assert.deepEqual(parseLanguages("German: B2, English (C1)"), [{ language: "German", level: "B2" }, { language: "English", level: "C1" }]);
});

test("template draft uses profile facts, job title and company – no invented content", () => {
  const p = { ...heuristicProfile(CV), headline: "Business Development Manager", totalYearsExperience: 7, achievements: ["Grew B2B revenue by 35%"] };
  const job = { title: "Business Development Manager (m/w/d)", company: "Acme GmbH", description: "Sie verantworten B2B sales und arbeiten mit Salesforce. Referenz: BDM-2026" };
  const de = templateDraft({ profile: p, job, language: "de", withCoverLetter: true });
  assert.equal(de.subject, "Bewerbung als Business Development Manager (Ref. BDM-2026) – Ardit Hoxha");
  assert.match(de.body, /^Sehr geehrte Damen und Herren,/);
  assert.match(de.body, /bei Acme GmbH/);
  assert.match(de.body, /B2B sales und Salesforce/);
  assert.match(de.body, /– Grew B2B revenue by 35%/);
  assert.match(de.body, /Mit freundlichen Grüßen\nArdit Hoxha$/);
  assert.ok(de.coverLetter?.includes("Acme GmbH"));
  const en = templateDraft({ profile: p, job, language: "en", recipientName: "Ms Weber", withCoverLetter: false });
  assert.match(en.body, /^Dear Ms Weber,/);
  assert.equal(en.coverLetter, null);
  assert.deepEqual(relevantSkills(p, job.description), ["B2B sales", "Salesforce"]);
});

test("free-mode profile produces a real keyword score", () => {
  const p = { ...heuristicProfile(CV), headline: "Business Development Manager" };
  const s = quickScore(p, { title: "Business Development Manager", description: "B2B sales, Salesforce, contract negotiation and market analysis in SaaS" });
  assert.ok(s.score >= 60, `score ${s.score}`);
});
