// Guardrail run on every generated (and every user-edited) draft before sending.
// Flags numbers, percentages and years that don't appear in the CV, and banned
// boilerplate phrases. Warnings are shown to the user – nothing is auto-changed.

export interface DraftWarning {
  kind: "unverified_number" | "cliche" | "missing_company" | "missing_title" | "placeholder";
  message: string;
}

const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

export function factCheck(
  draft: { subject: string; body: string },
  cvText: string,
  job: { title: string; company: string; description?: string },
  banned: string[] = [],
): DraftWarning[] {
  const w: DraftWarning[] = [];
  const text = `${draft.subject}\n${draft.body}`;
  const cv = fold(cvText);
  const ad = fold(job.description ?? "");
  const numbers = text.match(/\b\d+(?:[.,]\d+)?\s?(?:%|k|mio\.?|million|m€|€|eur|years?|jahre?n?)?/gi) ?? [];
  for (const raw of new Set(numbers.map((n) => n.trim()))) {
    const core = raw.match(/\d+(?:[.,]\d+)?/)![0];
    if (core.length === 1 && !/%|k|mio|million|€|eur/i.test(raw)) continue; // small counts like "2"
    const variants = [core, core.replace(",", "."), core.replace(".", ",")];
    if (!variants.some((v) => cv.includes(v) || ad.includes(v))) {
      w.push({ kind: "unverified_number", message: `"${raw}" does not appear in your CV or the job ad – please verify it.` });
    }
  }
  for (const b of banned) if (fold(text).includes(fold(b))) w.push({ kind: "cliche", message: `Generic phrase: "${b}"` });
  if (!fold(text).includes(fold(job.company).split(" ")[0])) w.push({ kind: "missing_company", message: "The company name is not mentioned." });
  const titleCore = fold(job.title).replace(/\(.*?\)/g, "").trim().split(" ").slice(0, 2).join(" ");
  if (titleCore && !fold(text).includes(titleCore)) w.push({ kind: "missing_title", message: "The exact job title is not mentioned." });
  if (/\[[^\]]{2,40}\]|\{\{|<name>|xxx/i.test(text)) w.push({ kind: "placeholder", message: "The draft still contains a placeholder." });
  return w;
}
