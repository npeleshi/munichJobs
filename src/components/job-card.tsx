"use client";
import Link from "next/link";
import clsx from "clsx";
import { Bookmark, BookmarkCheck, ExternalLink, MapPin, Clock, Banknote } from "lucide-react";
import { EmailIndicator, ScoreBadge } from "./ui";
import { SOURCE_LABEL, STATUS_LABEL, api, relDate } from "@/lib/client";

export interface JobItem {
  jobId: string;
  title: string;
  company: string;
  location: string;
  salaryText: string | null;
  postedAt: string | null;
  workMode: string | null;
  employment: string[];
  url: string;
  sources: { source: string; url: string }[];
  summary: string;
  contactStatus: string;
  atsVendor: string | null;
  score: number | null;
  scoreKind: "ai" | "estimate" | null;
  status: string;
  saved: boolean;
  isNew: boolean;
}

export function JobCard({ job, onChange }: { job: JobItem; onChange?: (j: JobItem) => void }) {
  const toggleSave = async () => {
    const saved = !job.saved;
    onChange?.({ ...job, saved });
    await api(`/api/jobs/${job.jobId}`, { method: "PATCH", body: { saved } }).catch(() => onChange?.(job));
  };
  return (
    <article className="card group flex flex-col gap-4 p-5 sm:flex-row">
      <div className="shrink-0"><ScoreBadge score={job.score} kind={job.scoreKind} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {job.isNew && <span className="rounded-full bg-isar-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-isar-700">New</span>}
          {job.status !== "NEW" && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-700">{STATUS_LABEL[job.status]}</span>}
        </div>
        <Link href={`/jobs/${job.jobId}`} className="mt-1 block font-semibold text-ink-950 hover:text-isar-700">{job.title}</Link>
        <div className="text-sm text-ink-700">{job.company}</div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1"><MapPin size={13} />{job.location || "Location n/a"}{job.workMode ? ` · ${job.workMode}` : ""}</span>
          <span className="inline-flex items-center gap-1"><Clock size={13} />{relDate(job.postedAt)}</span>
          {job.salaryText && <span className="inline-flex items-center gap-1"><Banknote size={13} />{job.salaryText}</span>}
        </div>
        <p className="mt-3 line-clamp-2 text-sm text-ink-600">{job.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <EmailIndicator status={job.contactStatus} ats={job.atsVendor} />
          <span className="text-xs text-ink-400">
            via {job.sources.map((s, i) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-isar-700">{i > 0 && ", "}{SOURCE_LABEL[s.source] ?? s.source}</a>
            ))}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-row items-start gap-2 sm:flex-col sm:items-stretch">
        <Link href={`/jobs/${job.jobId}`} className="btn-ghost">View Job</Link>
        <Link href={`/jobs/${job.jobId}?prepare=1`} className={clsx("btn-accent", job.status === "SENT" && "pointer-events-none opacity-50")}>{job.status === "SENT" ? "Applied" : "Prepare Application"}</Link>
        <div className="flex gap-2 sm:justify-end">
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3" title="Original listing"><ExternalLink size={16} /></a>
          <button onClick={toggleSave} className="btn-ghost px-3" title={job.saved ? "Unsave" : "Save"}>{job.saved ? <BookmarkCheck size={16} className="text-isar-600" /> : <Bookmark size={16} />}</button>
        </div>
      </div>
    </article>
  );
}
