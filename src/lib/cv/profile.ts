// Shape of the AI-extracted CV profile (also the JSON schema sent to Claude).
export interface CvProfile {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
  seniority: "student" | "entry" | "mid" | "senior" | "lead" | "executive" | null;
  totalYearsExperience: number | null;
  education: { degree: string; field: string | null; institution: string; year: string | null }[];
  experience: { title: string; company: string; start: string | null; end: string | null; highlights: string[] }[];
  skills: string[];
  languages: { language: string; level: string }[];
  certifications: string[];
  projects: { name: string; description: string }[];
  industries: string[];
  careerInterests: string[];
  achievements: string[];
}

const str = { type: "string" };
const nstr = { type: ["string", "null"] };
const arr = (items: object) => ({ type: "array", items });

export const CV_PROFILE_SCHEMA = {
  type: "object",
  properties: {
    name: nstr, email: nstr, phone: nstr, location: nstr, headline: nstr,
    seniority: { type: ["string", "null"], enum: ["student", "entry", "mid", "senior", "lead", "executive", null] },
    totalYearsExperience: { type: ["number", "null"] },
    education: arr({ type: "object", properties: { degree: str, field: nstr, institution: str, year: nstr }, required: ["degree", "institution"] }),
    experience: arr({ type: "object", properties: { title: str, company: str, start: nstr, end: nstr, highlights: arr(str) }, required: ["title", "company", "highlights"] }),
    skills: arr(str),
    languages: arr({ type: "object", properties: { language: str, level: str }, required: ["language", "level"] }),
    certifications: arr(str),
    projects: arr({ type: "object", properties: { name: str, description: str }, required: ["name", "description"] }),
    industries: arr(str),
    careerInterests: arr(str),
    achievements: arr(str),
  },
  required: ["skills", "languages", "experience", "education", "industries", "certifications", "projects", "careerInterests", "achievements"],
};
