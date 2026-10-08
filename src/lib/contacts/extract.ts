// Pure helpers for finding and classifying recruitment e-mail addresses that
// are *published* on a page. Nothing here guesses or constructs addresses.

export type ContactKind = "named_recruiter" | "careers" | "general";

export interface FoundEmail {
  email: string;
  kind: ContactKind;
  personName: string | null;
  context: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

const CAREERS_LOCAL = /^(jobs?|careers?|karriere|bewerbung(en)?|application(s)?|apply|recruiting|recruitment|recruiter|talent(s)?|talentacquisition|hr|personal|personalabteilung|people|hiring|join|joinus|work|stellen)([._-].*)?$/i;
const GENERAL_LOCAL = /^(info|kontakt|contact|office|hello|hallo|mail|service|team|zentrale|empfang|sales|vertrieb)([._-].*)?$/i;
const EXCLUDE_LOCAL = /^(datenschutz|privacy|dsb|dpo|gdpr|dataprotection|noreply|no-reply|donotreply|do-not-reply|webmaster|postmaster|abuse|presse|press|media|support|billing|rechnung|invoice|newsletter|unsubscribe|security|it|admin|investor|ir)([._-].*)?$/i;
const EXCLUDE_DOMAIN = /(example\.(com|org|de)|sentry\.io|wixpress\.com|domain\.(com|de)|email\.com|test\.de|arbeitsagentur\.de|linkedin\.com|indeed\.com|stepstone\.de|xing\.com|glassdoor\.|w3\.org|schema\.org|googlemail\.com)$/i;
const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;
const RECRUITER_CONTEXT = /(ansprechpartner|ansprechperson|kontaktperson|ihr kontakt|your contact|contact person|recruiter|talent acquisition|personalabteilung|bewerbung an|apply to|send your (cv|application)|richten sie|bewerbungsunterlagen|questions\? contact|fragen)/i;

/** Decode common obfuscations: "name [at] firma [dot] de", "name(at)firma.de", HTML entities. */
export function deobfuscate(text: string): string {
  return text
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/&#46;|&#x2e;|&period;/gi, ".")
    .replace(/\s*[\[(\{]\s*(at|ät|@)\s*[\])\}]\s*/gi, "@")
    .replace(/\s*[\[(\{]\s*(dot|punkt|\.)\s*[\])\}]\s*/gi, ".");
}

function namedPerson(local: string): string | null {
  const m = local.match(/^([a-zäöü]{2,})[._-]([a-zäöü]{2,})$/i);
  if (!m) return null;
  if (CAREERS_LOCAL.test(local) || GENERAL_LOCAL.test(local)) return null;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1).toLowerCase();
  return `${cap(m[1])} ${cap(m[2])}`;
}

export function classifyEmail(email: string, context: string): { kind: ContactKind; personName: string | null } | null {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain || EXCLUDE_LOCAL.test(local) || EXCLUDE_DOMAIN.test(domain) || FILE_EXT.test(email)) return null;
  if (CAREERS_LOCAL.test(local)) return { kind: "careers", personName: null };
  const person = namedPerson(local);
  if (person && RECRUITER_CONTEXT.test(context)) return { kind: "named_recruiter", personName: person };
  if (person) return { kind: "general", personName: person }; // a person, but not clearly the recruiter
  if (GENERAL_LOCAL.test(local)) return { kind: "general", personName: null };
  // Unknown local part: treat as recruitment-related only when the surrounding text says so.
  return RECRUITER_CONTEXT.test(context) ? { kind: "careers", personName: null } : { kind: "general", personName: null };
}

export function extractEmails(rawText: string): FoundEmail[] {
  const text = deobfuscate(rawText.replace(/mailto:/gi, " "));
  const out = new Map<string, FoundEmail>();
  for (const m of text.matchAll(EMAIL_RE)) {
    const email = m[0].replace(/\.+$/, "").toLowerCase();
    const i = m.index ?? 0;
    const context = text.slice(Math.max(0, i - 160), i + email.length + 60).replace(/\s+/g, " ");
    const c = classifyEmail(email, context);
    if (!c) continue;
    const prev = out.get(email);
    if (!prev || rank(c.kind) > rank(prev.kind)) out.set(email, { email, kind: c.kind, personName: c.personName, context });
  }
  return [...out.values()].sort((a, b) => rank(b.kind) - rank(a.kind));
}

export const rank = (k: ContactKind) => (k === "named_recruiter" ? 3 : k === "careers" ? 2 : 1);

// ---------- ATS / portal detection ----------
const ATS: [RegExp, string][] = [
  [/personio\.(de|com)/i, "Personio"],
  [/myworkdayjobs\.com|workday\.com/i, "Workday"],
  [/greenhouse\.io/i, "Greenhouse"],
  [/lever\.co/i, "Lever"],
  [/smartrecruiters\.com/i, "SmartRecruiters"],
  [/successfactors\.(com|eu)|jobs\.sap\.com/i, "SAP SuccessFactors"],
  [/softgarden\.(io|de)/i, "softgarden"],
  [/join\.com/i, "JOIN"],
  [/recruitee\.com/i, "Recruitee"],
  [/teamtailor\.com/i, "Teamtailor"],
  [/workable\.com/i, "Workable"],
  [/taleo\.net/i, "Oracle Taleo"],
  [/oraclecloud\.com/i, "Oracle Recruiting"],
  [/icims\.com/i, "iCIMS"],
  [/d\.vinci|dvinci-easy\.com|dvinci\.de/i, "d.vinci"],
  [/rexx-systems\.com|rexx-recruitment/i, "rexx"],
  [/umantis\.com|haufe/i, "Haufe umantis"],
  [/concludis\.de/i, "concludis"],
  [/onlyfy\.(io|jobs)|prescreen\.io/i, "onlyfy"],
  [/bite\.(de|ai)|b-ite\.de/i, "BITE"],
  [/comeet\.(co|com)/i, "Comeet"],
  [/ashbyhq\.com/i, "Ashby"],
  [/jobs\.lever|jobvite\.com/i, "Jobvite"],
];

export function detectAts(...urls: (string | null | undefined)[]): string | null {
  for (const u of urls) {
    if (!u) continue;
    for (const [re, name] of ATS) if (re.test(u)) return name;
  }
  return null;
}

/** Heuristic: does the ad say "apply only via our portal"? */
export function portalOnly(text: string): boolean {
  return /(ausschließlich|nur|only) (über|via|through) (unser(e|en)? )?(online[- ]?)?(bewerbungs)?(portal|formular|karriereseite|bewerbermanagement|application form|careers? (site|page|portal))/i.test(text)
    || /(bewerbungen per e-?mail|e-?mail applications?) (können|werden|can|will) (leider )?(nicht|not)/i.test(text);
}

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const JOB_BOARD_DOMAINS = /(arbeitsagentur\.de|arbeitnow\.com|adzuna\.|indeed\.|stepstone\.|linkedin\.|xing\.|glassdoor\.|jobware\.|monster\.|kununu\.|stellenanzeigen\.de|jobs\.de|meinestadt\.de)/i;

export function isJobBoard(url: string | null | undefined): boolean {
  const d = domainOf(url);
  return !d || JOB_BOARD_DOMAINS.test(d) || detectAts(url) !== null;
}

/** Root domain heuristic (handles .co.uk style suffixes loosely). */
export function registrableDomain(host: string): string {
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  const sld = parts[parts.length - 2];
  if (["co", "com", "org", "net", "gv", "ac"].includes(sld) && parts.length >= 3) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}
