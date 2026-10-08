export type SourceId = "arbeitsagentur" | "arbeitnow" | "adzuna";

export type EmploymentType = "full_time" | "part_time" | "internship" | "working_student" | "mini_job" | "apprenticeship";
export type WorkMode = "remote" | "hybrid" | "onsite";
export type Experience = "student" | "entry" | "mid" | "senior" | "lead";

/** A vacancy exactly as normalised from one source (before dedupe). */
export interface RawJob {
  source: SourceId;
  externalId: string;
  title: string;
  company: string;
  location: string;
  lat?: number | null;
  lon?: number | null;
  salaryText?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  employment: EmploymentType[];
  workMode?: WorkMode | null;
  industry?: string | null;
  postedAt?: Date | null;
  description: string; // plain text
  url: string; // original listing
  applyUrl?: string | null;
  companyWebsite?: string | null;
}

export interface SearchParams {
  titles: string[];
  language: "de" | "en" | "both";
  expand: boolean;
  location: string; // default "München"
  radiusKm: number;
  employment: EmploymentType[];
  workModes: WorkMode[];
  experience: Experience[];
  minSalary?: number | null;
  industry?: string | null;
  publishedWithinDays: number;
  sort: "relevance" | "date" | "match";
}

export interface SourceReport {
  source: SourceId | string;
  label: string;
  status: "ok" | "error" | "skipped";
  count: number;
  message?: string;
}

export interface DeepLink {
  source: string;
  label: string;
  url: string;
  reason: string;
}
