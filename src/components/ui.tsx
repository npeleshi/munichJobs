import clsx from "clsx";
import { Mail, MailQuestion, MailWarning, Globe2 } from "lucide-react";

export function ScoreBadge({ score, kind, size = "md" }: { score: number | null | undefined; kind?: "ai" | "estimate" | null; size?: "md" | "lg" }) {
  if (score == null) return <span className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-500">No score</span>;
  const tone = score >= 75 ? "bg-isar-600 text-white" : score >= 55 ? "bg-amber-100 text-amber-600" : "bg-ink-100 text-ink-700";
  return (
    <span title={kind === "ai" ? "Claude evaluation" : "Keyword estimate – open the job for a full AI evaluation"} className={clsx("inline-flex flex-col items-center justify-center rounded-xl font-semibold tabular-nums", tone, size === "lg" ? "h-16 w-16 text-2xl" : "h-11 w-11 text-sm")}>
      {score}
      <span className={clsx("font-normal opacity-80", size === "lg" ? "text-[10px]" : "text-[9px]")}>{kind === "ai" ? "AI" : "est."}</span>
    </span>
  );
}

export function EmailIndicator({ status, ats }: { status: string; ats?: string | null }) {
  if (status === "found") return <span className="inline-flex items-center gap-1 text-xs font-medium text-isar-700"><Mail size={14} /> Recruiter e-mail</span>;
  if (status === "general_only") return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600"><MailWarning size={14} /> General e-mail only</span>;
  if (status === "not_found") return <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-500"><Globe2 size={14} /> {ats ? `Apply via ${ats}` : "Email not found"}</span>;
  return <span className="inline-flex items-center gap-1 text-xs text-ink-400"><MailQuestion size={14} /> E-mail not checked yet</span>;
}

export function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</div>
      <div className="mt-2 font-display text-3xl text-ink-950 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-400">{hint}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="font-display text-xl text-ink-900">{title}</div>
      <div className="max-w-md text-sm text-ink-500">{children}</div>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: React.ReactNode }) {
  const cls = { info: "border-ink-200 bg-ink-100 text-ink-800", warn: "border-amber-600/30 bg-amber-100 text-amber-600", error: "border-rose-600/30 bg-rose-100 text-rose-600", ok: "border-isar-500/30 bg-isar-50 text-isar-700" }[tone];
  return <div className={clsx("rounded-xl border px-4 py-3 text-sm", cls)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl text-ink-950">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
