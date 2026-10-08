// Deterministic title expansion (DE <-> EN + common variants).
// AI expansion (lib/ai-tasks.ts) is layered on top when an API key is present;
// the user always sees and can edit the final list before searching.

const GROUPS: { en: string[]; de: string[] }[] = [
  { en: ["Business Development Manager", "Business Developer", "Head of Business Development", "Partnership Manager"], de: ["Manager Business Development", "Geschäftsentwicklung", "Referent Geschäftsentwicklung"] },
  { en: ["Sales Manager", "Account Executive", "Key Account Manager"], de: ["Vertriebsmitarbeiter", "Vertriebsleiter", "Key Account Manager", "Vertriebsmanager"] },
  { en: ["Project Manager", "Program Manager"], de: ["Projektmanager", "Projektleiter", "Projektkoordinator"] },
  { en: ["Product Manager", "Product Owner"], de: ["Produktmanager", "Product Owner"] },
  { en: ["Software Engineer", "Software Developer", "Backend Developer", "Frontend Developer", "Full Stack Developer"], de: ["Softwareentwickler", "Softwareingenieur", "Entwickler"] },
  { en: ["Data Scientist", "Data Analyst", "Data Engineer"], de: ["Datenanalyst", "Data Scientist", "Datenwissenschaftler"] },
  { en: ["Marketing Manager", "Online Marketing Manager", "Performance Marketing Manager"], de: ["Marketingmanager", "Marketing Referent", "Online-Marketing-Manager"] },
  { en: ["HR Manager", "Recruiter", "Talent Acquisition Specialist"], de: ["Personalreferent", "Personalsachbearbeiter", "Recruiter"] },
  { en: ["Accountant", "Financial Controller", "Finance Manager"], de: ["Buchhalter", "Controller", "Finanzbuchhalter", "Bilanzbuchhalter"] },
  { en: ["Customer Success Manager", "Customer Service Representative"], de: ["Kundenbetreuer", "Kundenservice Mitarbeiter", "Customer Success Manager"] },
  { en: ["Office Manager", "Executive Assistant"], de: ["Büromanager", "Assistenz der Geschäftsführung", "Office Manager"] },
  { en: ["Mechanical Engineer"], de: ["Maschinenbauingenieur", "Konstrukteur"] },
  { en: ["Electrical Engineer"], de: ["Elektroingenieur", "Elektrotechniker"] },
  { en: ["Nurse"], de: ["Pflegefachkraft", "Gesundheits- und Krankenpfleger"] },
  { en: ["Consultant", "Management Consultant"], de: ["Berater", "Unternehmensberater"] },
  { en: ["Lawyer", "Legal Counsel"], de: ["Rechtsanwalt", "Syndikusrechtsanwalt", "Jurist"] },
  { en: ["Procurement Manager", "Buyer"], de: ["Einkäufer", "Einkaufsmanager", "Strategischer Einkäufer"] },
  { en: ["Logistics Manager", "Supply Chain Manager"], de: ["Logistikleiter", "Supply Chain Manager", "Disponent"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/\s+/g, " ").trim();

export function expandTitles(titles: string[], language: "de" | "en" | "both"): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    if (!out.some((x) => norm(x) === norm(t))) out.push(t);
  };
  for (const t of titles) {
    push(t.trim());
    const g = GROUPS.find((g) => [...g.en, ...g.de].some((x) => norm(x) === norm(t) || norm(t).includes(norm(x)) || norm(x).includes(norm(t))));
    if (!g) continue;
    if (language !== "de") g.en.forEach(push);
    if (language !== "en") g.de.forEach(push);
  }
  return out.slice(0, 12);
}
