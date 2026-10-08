// Fast, deterministic CV↔job estimate used to rank *every* result instantly.
// It is always labelled "keyword estimate" in the UI; the Claude evaluation
// (ai-tasks.ts → evaluateMatch) is the authoritative, explained score.
import type { CvProfile } from "./profile";

const fold = (s: string) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

const STOP = new Set(["und", "der", "die", "das", "for", "the", "and", "mit", "von", "manager", "senior", "junior", "m", "w", "d", "f", "x"]);

function words(s: string): string[] {
  return fold(s).split(/[^a-z0-9+#]+/).filter((w) => w.length > 1 && !STOP.has(w));
}

const GERMAN_REQUIRED = /(fliessend|fließend|verhandlungssicher|sehr gute|exzellente|native|fluent|business[- ]fluent|c1|c2)[^.\n]{0,40}(deutsch|german)|(deutsch|german)[^.\n]{0,40}(fliessend|fließend|verhandlungssicher|c1|c2|fluent|native|muttersprach)/i;
const STRONG_LEVEL = /(c1|c2|fluent|fliessend|fließend|verhandlungssicher|native|muttersprach|mother tongue|business)/i;

export function germanRequirement(jobText: string): boolean {
  return GERMAN_REQUIRED.test(jobText);
}

export function profileHasStrongGerman(p: CvProfile): boolean {
  return p.languages.some((l) => /deutsch|german/i.test(l.language) && STRONG_LEVEL.test(l.level));
}

export interface QuickScore {
  score: number;
  matchedSkills: string[];
  titleSimilarity: number;
  germanRequired: boolean;
  germanOk: boolean | null;
}

export function quickScore(p: CvProfile, job: { title: string; description: string; industry?: string | null }): QuickScore {
  const text = fold(`${job.title}\n${job.description}`);
  const matchedSkills = p.skills.filter((s) => {
    const f = fold(s).trim();
    return f.length > 1 && new RegExp(`(^|[^a-z0-9])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
  });
  const titleWords = new Set(words(job.title));
  const cvTitleWords = new Set(words([p.headline ?? "", ...p.experience.map((e) => e.title), ...p.careerInterests].join(" ")));
  const overlap = [...titleWords].filter((w) => cvTitleWords.has(w)).length;
  const titleSimilarity = titleWords.size ? overlap / titleWords.size : 0;
  const skillCov = Math.min(1, matchedSkills.length / 6);
  const industryHit = p.industries.some((i) => text.includes(fold(i))) || (job.industry ? p.industries.some((i) => fold(job.industry!).includes(fold(i))) : false);
  let score = 100 * (0.45 * titleSimilarity + 0.45 * skillCov + 0.1 * (industryHit ? 1 : 0));
  const germanRequired = germanRequirement(`${job.title}\n${job.description}`);
  const germanOk = germanRequired ? profileHasStrongGerman(p) : null;
  if (germanRequired && !germanOk) score *= 0.6;
  return { score: Math.max(0, Math.min(100, Math.round(score))), matchedSkills, titleSimilarity, germanRequired, germanOk };
}
