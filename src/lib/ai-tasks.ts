import { aiStructured } from "./ai";
import { CV_PROFILE_SCHEMA, type CvProfile } from "./cv/profile";

// ---------------- CV analysis ----------------
export async function analyzeCv(cvText: string): Promise<CvProfile> {
  return aiStructured<CvProfile>({
    system:
      "You extract structured data from CVs/résumés (German or English). Only record facts that are explicitly stated in the CV. " +
      "Never infer or embellish skills, degrees, employers, dates or achievements. Use null or empty arrays when something is absent. " +
      "Keep skills atomic (e.g. 'Salesforce', 'B2B sales', 'contract negotiation'). Language levels: copy the CV's wording (e.g. 'C1', 'fließend', 'native').",
    prompt: `<cv>\n${cvText.slice(0, 60000)}\n</cv>\n\nExtract the profile.`,
    toolName: "cv_profile",
    schema: CV_PROFILE_SCHEMA,
    maxTokens: 4000,
  });
}

// ---------------- Match evaluation ----------------
export interface MatchResult {
  score: number;
  realistic: "strong" | "realistic" | "stretch" | "unlikely";
  summary: string;
  whyGoodMatch: string[];
  matchedQualifications: { requirement: string; evidence: string }[];
  missingRequirements: { requirement: string; kind: "explicit" | "inferred"; severity: "blocker" | "important" | "minor" }[];
  languageRequirements: { language: string; required: string; kind: "explicit" | "inferred"; satisfied: "yes" | "no" | "unclear"; candidateLevel: string | null }[];
  inferredPreferences: string[];
}

const MATCH_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 100 },
    realistic: { type: "string", enum: ["strong", "realistic", "stretch", "unlikely"] },
    summary: { type: "string", description: "2 sentences, plain and specific." },
    whyGoodMatch: { type: "array", items: { type: "string" } },
    matchedQualifications: { type: "array", items: { type: "object", properties: { requirement: { type: "string" }, evidence: { type: "string", description: "Where in the CV this is shown" } }, required: ["requirement", "evidence"] } },
    missingRequirements: { type: "array", items: { type: "object", properties: { requirement: { type: "string" }, kind: { type: "string", enum: ["explicit", "inferred"] }, severity: { type: "string", enum: ["blocker", "important", "minor"] } }, required: ["requirement", "kind", "severity"] } },
    languageRequirements: { type: "array", items: { type: "object", properties: { language: { type: "string" }, required: { type: "string" }, kind: { type: "string", enum: ["explicit", "inferred"] }, satisfied: { type: "string", enum: ["yes", "no", "unclear"] }, candidateLevel: { type: ["string", "null"] } }, required: ["language", "required", "kind", "satisfied"] } },
    inferredPreferences: { type: "array", items: { type: "string" }, description: "Things the employer probably prefers but did NOT state." },
  },
  required: ["score", "realistic", "summary", "whyGoodMatch", "matchedQualifications", "missingRequirements", "languageRequirements", "inferredPreferences"],
};

export async function evaluateMatch(profile: CvProfile, job: { title: string; company: string; description: string; location: string }): Promise<MatchResult> {
  return aiStructured<MatchResult>({
    system:
      "You are an experienced Munich-based recruiter assessing candidate fit honestly. " +
      "Mark a requirement 'explicit' ONLY if the job text states it; anything you assume from context is 'inferred'. " +
      "Evidence must point to real CV content. Don't flatter: a missing hard requirement (degree, licence, fluent German when stated) lowers the score substantially. " +
      "Score guide: 85+ strong fit for most explicit requirements; 70-84 good; 50-69 partial; <50 weak. Write in English.",
    prompt: `<candidate_profile>\n${JSON.stringify(profile)}\n</candidate_profile>\n\n<job>\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\n${job.description.slice(0, 15000)}\n</job>`,
    toolName: "match_evaluation",
    schema: MATCH_SCHEMA,
    maxTokens: 2500,
  });
}

// ---------------- Title expansion ----------------
export async function expandTitlesAi(titles: string[], language: "de" | "en" | "both"): Promise<string[]> {
  const r = await aiStructured<{ titles: string[] }>({
    system: "You know the German job market. Suggest job-title search terms that recruiters in Germany actually use. No gender suffixes like (m/w/d).",
    prompt: `Input titles: ${titles.join(", ")}\nLanguage: ${language === "both" ? "German and English" : language === "de" ? "German" : "English"}\nReturn up to 8 closely related titles (synonyms, German equivalents, common seniority variants). Don't drift into different professions.`,
    toolName: "titles",
    schema: { type: "object", properties: { titles: { type: "array", items: { type: "string" } } }, required: ["titles"] },
    maxTokens: 500,
  });
  return r.titles;
}

// ---------------- Application drafting ----------------
export interface Draft {
  subject: string;
  body: string;
  coverLetter: string | null;
  usedFacts: string[];
}

const BANNED = [
  "I am writing to express my interest", "hiermit bewerbe ich mich", "mit großem Interesse habe ich", "I am excited to apply",
  "passionate", "dynamic", "synergy", "leverage", "go-getter", "team player", "hard-working", "results-driven",
  "perfect fit", "unique opportunity", "I believe I would be a great asset", "I am confident that", "thrilled", "delve",
];

export async function draftApplication(opts: {
  profile: CvProfile;
  cvText: string;
  job: { title: string; company: string; industry?: string | null; description: string; location: string };
  language: "de" | "en";
  recipientName?: string | null;
  withCoverLetter: boolean;
  signature?: string | null;
  instructions?: string | null;
}): Promise<Draft> {
  const { profile, job, language } = opts;
  return aiStructured<Draft>({
    system:
      "You write job-application e-mails for a real candidate. Absolute rules:\n" +
      "1. Use ONLY facts present in the CV text. Never invent or round up numbers, employers, titles, tools, degrees or achievements.\n" +
      "2. Mention the exact job title and company name.\n" +
      "3. Pick the 2-3 CV facts most relevant to this ad and connect each to a concrete requirement from the ad.\n" +
      "4. 140-220 words for the e-mail body. Plain, confident, specific. No clichés. Avoid these phrases: " + BANNED.join("; ") + ".\n" +
      "5. German: use 'Sie', standard German business letter tone ('Sehr geehrte Frau X' if a named contact is given, else 'Sehr geehrte Damen und Herren'). English: 'Dear Ms/Mr X' or 'Dear Hiring Team'.\n" +
      "6. Mention that the CV is attached. End with availability for a conversation and the candidate's name.\n" +
      "7. Subject line: specific, e.g. 'Bewerbung als <Title> – <Name>' / 'Application: <Title> – <Name>' plus one hook if natural. Include the reference number if the ad has one.\n" +
      "8. usedFacts: list each CV fact you relied on, quoted briefly from the CV.",
    prompt:
      `Language: ${language === "de" ? "German" : "English"}\n` +
      (opts.recipientName ? `Named contact: ${opts.recipientName}\n` : "") +
      (opts.instructions ? `Extra instructions from the candidate: ${opts.instructions}\n` : "") +
      (opts.signature ? `Candidate's signature block (append verbatim):\n${opts.signature}\n` : "") +
      `Cover letter: ${opts.withCoverLetter ? "also write a one-page cover letter (Anschreiben, 250-350 words, same rules) in coverLetter" : "set coverLetter to null"}\n\n` +
      `<cv_text>\n${opts.cvText.slice(0, 30000)}\n</cv_text>\n\n<cv_profile>\n${JSON.stringify(profile)}\n</cv_profile>\n\n` +
      `<job>\nTitle: ${job.title}\nCompany: ${job.company}\nIndustry: ${job.industry ?? "unknown"}\nLocation: ${job.location}\n\n${job.description.slice(0, 15000)}\n</job>`,
    toolName: "application",
    schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
        coverLetter: { type: ["string", "null"] },
        usedFacts: { type: "array", items: { type: "string" } },
      },
      required: ["subject", "body", "coverLetter", "usedFacts"],
    },
    maxTokens: 3000,
  });
}

export { BANNED as BANNED_PHRASES };
