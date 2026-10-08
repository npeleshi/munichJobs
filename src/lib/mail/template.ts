// Free (no-AI) application drafts. Built only from the user's own profile
// fields and the job ad, so nothing is invented. The user edits before sending.
import type { CvProfile } from "../cv/profile";

const fold = (s: string) => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");

export function relevantSkills(p: CvProfile, jobText: string, max = 4): string[] {
  const t = fold(jobText);
  const hit = p.skills.filter((s) => s.trim().length > 1 && t.includes(fold(s.trim())));
  return (hit.length ? hit : p.skills).slice(0, max);
}

const joinList = (xs: string[], and: string) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`);
const cleanTitle = (t: string) => t.replace(/\s*\((m|w|d|f|x|all|gn)[^)]*\)/gi, "").trim();

export function templateDraft(opts: {
  profile: CvProfile;
  job: { title: string; company: string; description: string };
  language: "de" | "en";
  recipientName?: string | null;
  withCoverLetter: boolean;
  signature?: string | null;
}): { subject: string; body: string; coverLetter: string | null; usedFacts: string[] } {
  const { profile: p, job, language } = opts;
  const title = cleanTitle(job.title);
  const name = p.name ?? "";
  const skills = relevantSkills(p, `${job.title}\n${job.description}`);
  const ach = p.achievements.slice(0, 2);
  const years = p.totalYearsExperience;
  const role = p.headline ?? p.experience[0]?.title ?? null;
  const ref = job.description.match(/(?:Referenz|Kennziffer|Ref\.?(?:-Nr\.?)?|Job[- ]?ID)[:\s#]*([A-Z0-9-]{3,20})/i)?.[1];
  const usedFacts = [role, years != null ? `${years} years experience` : null, ...skills, ...ach, ...p.languages.map((l) => `${l.language} ${l.level}`)].filter(Boolean) as string[];
  const sign = opts.signature?.trim() || name;

  if (language === "de") {
    const greet = opts.recipientName ? `Guten Tag ${opts.recipientName},` : "Sehr geehrte Damen und Herren,";
    const intro = `mit Interesse habe ich Ihre Ausschreibung als ${title} bei ${job.company} gelesen und bewerbe mich hiermit auf diese Position.`;
    const who = role ? `Derzeit bin ich als ${role} tätig${years != null ? ` und bringe ${years} Jahre Berufserfahrung mit` : ""}.` : years != null ? `Ich bringe ${years} Jahre Berufserfahrung mit.` : "";
    const sk = skills.length ? `Für die Aufgaben bei ${job.company} kann ich insbesondere meine Erfahrung in ${joinList(skills, "und")} einbringen.` : "";
    const ac = ach.length ? `Zu meinen Ergebnissen gehören:\n${ach.map((a) => `– ${a}`).join("\n")}` : "";
    const lang = p.languages.length ? `Sprachen: ${p.languages.map((l) => `${l.language} (${l.level})`).join(", ")}.` : "";
    const body = [greet, intro, [who, sk].filter(Boolean).join(" "), ac, lang, "Meinen Lebenslauf finden Sie im Anhang. Über die Gelegenheit zu einem persönlichen Gespräch freue ich mich sehr.", `Mit freundlichen Grüßen\n${sign}`].filter(Boolean).join("\n\n");
    const cover = opts.withCoverLetter ? `${name}\n${[p.location, p.email, p.phone].filter(Boolean).join(" · ")}\n\n${job.company}\n\nBewerbung als ${title}${ref ? ` (Ref. ${ref})` : ""}\n\n${body}` : null;
    return { subject: `Bewerbung als ${title}${ref ? ` (Ref. ${ref})` : ""}${name ? ` – ${name}` : ""}`, body, coverLetter: cover, usedFacts };
  }

  const greet = opts.recipientName ? `Dear ${opts.recipientName},` : "Dear Hiring Team,";
  const intro = `I would like to apply for the ${title} position at ${job.company}.`;
  const who = role ? `I currently work as ${role}${years != null ? ` and have ${years} years of professional experience` : ""}.` : years != null ? `I have ${years} years of professional experience.` : "";
  const sk = skills.length ? `For this role I can contribute my experience in ${joinList(skills, "and")}.` : "";
  const ac = ach.length ? `Some results from my work:\n${ach.map((a) => `– ${a}`).join("\n")}` : "";
  const lang = p.languages.length ? `Languages: ${p.languages.map((l) => `${l.language} (${l.level})`).join(", ")}.` : "";
  const body = [greet, intro, [who, sk].filter(Boolean).join(" "), ac, lang, "Please find my CV attached. I would welcome the opportunity to discuss how I can contribute to your team.", `Kind regards,\n${sign}`].filter(Boolean).join("\n\n");
  const cover = opts.withCoverLetter ? `${name}\n${[p.location, p.email, p.phone].filter(Boolean).join(" · ")}\n\n${job.company}\n\nApplication: ${title}${ref ? ` (Ref. ${ref})` : ""}\n\n${body}` : null;
  return { subject: `Application: ${title}${ref ? ` (Ref. ${ref})` : ""}${name ? ` – ${name}` : ""}`, body, coverLetter: cover, usedFacts };
}
