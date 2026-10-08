// Free, AI-less CV handling: a basic profile pre-filled from the CV text with
// simple rules, which the user then completes/corrects on the CV page.
// Only things literally present in the CV are extracted – nothing is invented.
import type { CvProfile } from "./profile";

const LANGS: [RegExp, string][] = [
  [/\b(deutsch|german|gjermanisht)\b/i, "German"],
  [/\b(englisch|english|anglisht)\b/i, "English"],
  [/\b(albanisch|albanian|shqip)\b/i, "Albanian"],
  [/\b(italienisch|italian|italisht)\b/i, "Italian"],
  [/\b(französisch|french|frëngjisht)\b/i, "French"],
  [/\b(spanisch|spanish|spanjisht)\b/i, "Spanish"],
  [/\b(türkisch|turkish|turqisht)\b/i, "Turkish"],
  [/\b(griechisch|greek|greqisht)\b/i, "Greek"],
];
const LEVEL = /\b(A1|A2|B1|B2|C1|C2|native|muttersprache|mother tongue|fluent|fließend|verhandlungssicher|business|basic|grundkenntnisse|gute kenntnisse|sehr gute kenntnisse)\b/i;

export function emptyProfile(): CvProfile {
  return {
    name: null, email: null, phone: null, location: null, headline: null, seniority: null, totalYearsExperience: null,
    education: [], experience: [], skills: [], languages: [], certifications: [], projects: [], industries: [], careerInterests: [], achievements: [],
  };
}

export function heuristicProfile(text: string): CvProfile {
  const p = emptyProfile();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  p.email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0] ?? null;
  p.phone = text.match(/(\+|00)\d[\d\s/().-]{7,}\d/)?.[0]?.trim() ?? null;
  const first = lines.find((l) => /^[A-ZÄÖÜÇË][\p{L}'-]+(\s+[A-ZÄÖÜÇË][\p{L}'-]+){1,3}$/u.test(l) && !/curriculum|lebenslauf|resume|cv/i.test(l));
  p.name = first ?? null;

  for (const [re, name] of LANGS) {
    const line = lines.find((l) => re.test(l));
    if (line) p.languages.push({ language: name, level: line.match(LEVEL)?.[0] ?? "mentioned in CV" });
  }

  // "Skills / Kenntnisse / Kompetenzen" section → comma/bullet separated items
  const idx = lines.findIndex((l) => /^(skills|key skills|kenntnisse|kompetenzen|fähigkeiten|aftësi|competences)\b/i.test(l));
  if (idx >= 0) {
    const items = lines.slice(idx + 1, idx + 12)
      .join(",")
      .split(/[,;•·|\n]/)
      .map((s) => s.replace(/^[-–*]\s*/, "").trim())
      .filter((s) => s.length > 1 && s.length < 40);
    p.skills = [...new Set(items)].slice(0, 25);
  }

  const years = [...text.matchAll(/\b(19[89]\d|20[0-3]\d)\b/g)].map((m) => Number(m[1]));
  if (years.length >= 2) p.totalYearsExperience = Math.max(0, Math.min(40, new Date().getFullYear() - Math.min(...years)));
  return p;
}

/** Parses the simple text fields of the manual profile form. */
export function parseLanguages(s: string): { language: string; level: string }[] {
  return s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [language, ...rest] = x.split(/[:\-–(]/);
    return { language: language.trim(), level: rest.join(" ").replace(/\)/g, "").trim() || "not specified" };
  });
}
export const parseList = (s: string) => [...new Set(s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))];
