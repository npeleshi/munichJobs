"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { JobCard, type JobItem } from "./job-card";
import { Empty } from "./ui";

export function JobList({ view, emptyTitle, emptyText }: { view: "all" | "high" | "saved" | "new"; emptyTitle: string; emptyText: string }) {
  const [items, setItems] = useState<JobItem[] | null>(null);
  const [sort, setSort] = useState("match");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ items: JobItem[] }>(`/api/jobs?view=${view}&sort=${sort}&q=${encodeURIComponent(q)}`)
        .then((r) => setItems(r.items))
        .catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [view, sort, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Filter by title or company" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="match">Sort: CV match</option>
          <option value="date">Sort: newest</option>
        </select>
      </div>
      {error && <div className="text-sm text-rose-600">{error}</div>}
      {items === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="card h-36 animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <Empty title={emptyTitle}>{emptyText}</Empty>
      ) : (
        <div className="space-y-3">
          {items.map((j) => <JobCard key={j.jobId} job={j} onChange={(n) => setItems((all) => all!.map((x) => (x.jobId === n.jobId ? n : x)).filter((x) => view !== "saved" || x.saved))} />)}
        </div>
      )}
    </div>
  );
}
