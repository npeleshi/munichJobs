"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { api, STATUS_LABEL } from "@/lib/client";
import { Empty, PageHeader } from "@/components/ui";

type App = {
  id: string; subject: string; toEmail: string | null; status: string; sentAt: string | null; updatedAt: string; error: string | null; provider: string | null;
  job: { id: string; title: string; company: string; location: string; url: string; userJobs: { status: string; notes: string | null }[] };
};

const FILTERS = [["", "All"], ["draft", "Drafts"], ["ready", "Ready"], ["sent", "Sent"], ["failed", "Failed"]];
const APP_STATUS: Record<string, string> = { draft: "Draft", ready: "Ready to send", sending: "Sending…", sent: "Sent", failed: "Failed" };

export default function Applications() {
  const [items, setItems] = useState<App[] | null>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setItems(null);
    api<{ items: App[] }>(`/api/applications${filter ? `?status=${filter}` : ""}`).then((r) => setItems(r.items));
  }, [filter]);

  const setPipeline = async (a: App, status: string) => {
    await api(`/api/jobs/${a.job.id}`, { method: "PATCH", body: { status } });
    setItems((all) => all!.map((x) => (x.id === a.id ? { ...x, job: { ...x.job, userJobs: [{ ...x.job.userJobs[0], status }] } } : x)));
  };
  const saveNotes = (a: App, notes: string) => api(`/api/jobs/${a.job.id}`, { method: "PATCH", body: { notes } });

  return (
    <>
      <PageHeader title="Applications" subtitle="Everything you've prepared and sent. Each position can only be applied to once." />
      <div className="mb-4 flex flex-wrap gap-2">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "chip-on" : "chip-off"} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {items === null ? <div className="card h-40 animate-pulse" /> : items.length === 0 ? (
        <Empty title="No applications here">Open a job and click “Prepare Application” to create a draft.</Empty>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="card grid gap-4 p-5 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", a.status === "sent" ? "bg-isar-100 text-isar-700" : a.status === "failed" ? "bg-rose-100 text-rose-600" : "bg-ink-100 text-ink-700")}>{APP_STATUS[a.status]}</span>
                  {a.sentAt && <span className="text-xs text-ink-500">{new Date(a.sentAt).toLocaleString("de-DE")} via {a.provider === "google" ? "Gmail" : "Outlook"}</span>}
                </div>
                <Link href={`/jobs/${a.job.id}`} className="mt-1 block font-semibold hover:text-isar-700">{a.job.title}</Link>
                <div className="text-sm text-ink-600">{a.job.company} · {a.job.location}</div>
                <div className="mt-1 truncate text-xs text-ink-500">“{a.subject}” → {a.toEmail ?? "no recipient yet"}</div>
                {a.error && a.status === "failed" && <div className="mt-1 text-xs text-rose-600">{a.error}</div>}
                <textarea className="input mt-3 min-h-[60px] text-xs" placeholder="Notes" defaultValue={a.job.userJobs[0]?.notes ?? ""} onBlur={(e) => saveNotes(a, e.target.value)} />
              </div>
              <div className="flex flex-col gap-2 md:w-56">
                <label className="label">Pipeline status</label>
                <select className="input" value={a.job.userJobs[0]?.status ?? "NEW"} onChange={(e) => setPipeline(a, e.target.value)}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k} disabled={k === "SENT" && a.status !== "sent"}>{v}</option>)}
                </select>
                {a.status !== "sent" && <Link href={`/jobs/${a.job.id}?prepare=1`} className="btn-accent">Review & send</Link>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
