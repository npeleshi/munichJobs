"use client";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { BellPlus, ExternalLink, Loader2, RefreshCw, Search, X } from "lucide-react";
import { api } from "@/lib/client";
import { JobCard, type JobItem } from "@/components/job-card";
import { Empty, Notice, PageHeader } from "@/components/ui";

type Params = {
  titles: string[];
  language: "de" | "en" | "both";
  expand: boolean;
  location: string;
  radiusKm: number;
  employment: string[];
  workModes: string[];
  experience: string[];
  minSalary: number | null;
  industry: string | null;
  publishedWithinDays: number;
  sort: "relevance" | "date" | "match";
};

type Outcome = {
  terms: string[];
  expandedBy: string;
  total: number;
  newCount: number;
  jobIds: string[];
  reports: { source: string; label: string; status: string; count: number; message?: string }[];
  deepLinks: { source: string; label: string; url: string; reason: string }[];
};

const DEFAULTS: Params = { titles: [], language: "both", expand: true, location: "München", radiusKm: 25, employment: [], workModes: [], experience: [], minSalary: null, industry: null, publishedWithinDays: 30, sort: "match" };

const EMPLOYMENT = [["full_time", "Full-time"], ["part_time", "Part-time"], ["internship", "Internship"], ["working_student", "Working student"]];
const MODES = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]];
const LEVELS = [["student", "Student"], ["entry", "Entry"], ["mid", "Mid"], ["senior", "Senior"], ["lead", "Lead / Head"]];

function Chips({ options, value, onChange }: { options: string[][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([k, label]) => (
        <button type="button" key={k} className={value.includes(k) ? "chip-on" : "chip-off"} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>{label}</button>
      ))}
    </div>
  );
}

export default function FindJobs() {
  const [p, setP] = useState<Params>(DEFAULTS);
  const [titleInput, setTitleInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [items, setItems] = useState<JobItem[] | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("mja:lastSearch");
      if (raw) setP({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch { /* storage unavailable */ }
    api<{ items: JobItem[] }>("/api/jobs?view=all&sort=match").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, []);

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setP((x) => ({ ...x, [k]: v }));
  const addTitle = () => {
    const t = titleInput.trim();
    if (t && !p.titles.includes(t)) set("titles", [...p.titles, t].slice(0, 8));
    setTitleInput("");
  };

  const loadResults = async (o: Outcome, sort = p.sort) => {
    if (!o.jobIds.length) return setItems([]);
    const r = await api<{ items: JobItem[] }>(`/api/jobs?ids=${o.jobIds.join(",")}&sort=${sort}`);
    setItems(r.items);
  };

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const params = titleInput.trim() ? { ...p, titles: [...new Set([...p.titles, titleInput.trim()])] } : p;
    if (!params.titles.length) return setError("Enter at least one job title.");
    setP(params);
    setTitleInput("");
    setError(null);
    setLoading(true);
    try {
      localStorage.setItem("mja:lastSearch", JSON.stringify(params));
    } catch { /* ignore */ }
    try {
      const o = await api<Outcome>("/api/search", { method: "POST", body: params });
      setOutcome(o);
      await loadResults(o, params.sort);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const saveAlert = async () => {
    const name = p.titles.join(", ");
    await api("/api/saved-searches", { method: "POST", body: { name, params: p, intervalHours: 24 } })
      .then(() => setSavedMsg(`Alert saved – "${name}" will be refreshed daily. Manage it in Settings.`))
      .catch((e) => setSavedMsg(e.message));
  };

  const ok = useMemo(() => outcome?.reports.filter((r) => r.status === "ok") ?? [], [outcome]);

  return (
    <>
      <PageHeader title="Find jobs" subtitle="Live search across public job sources in and around Munich." />

      <form onSubmit={search} className="card space-y-5 p-5 sm:p-6">
        <div>
          <label className="label">Job titles</label>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white px-2 py-1.5 focus-within:border-isar-500">
            {p.titles.map((t) => (
              <span key={t} className="chip-on">{t}<button type="button" onClick={() => set("titles", p.titles.filter((x) => x !== t))} aria-label={`Remove ${t}`}><X size={12} /></button></span>
            ))}
            <input
              className="min-w-[200px] flex-1 border-0 bg-transparent px-1 py-1 text-sm outline-none"
              placeholder={p.titles.length ? "Add another title…" : "e.g. Business Development Manager"}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && titleInput.trim()) { e.preventDefault(); addTitle(); } else if (e.key === ",") { e.preventDefault(); addTitle(); } }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-400">Press Enter or comma to add several titles.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="label">Location</label>
            <input className="input" value={p.location} onChange={(e) => set("location", e.target.value)} />
          </div>
          <div>
            <label className="label">Radius: {p.radiusKm} km</label>
            <input type="range" min={0} max={100} step={5} value={p.radiusKm} onChange={(e) => set("radiusKm", Number(e.target.value))} className="mt-3 w-full accent-isar-600" />
          </div>
          <div>
            <label className="label">Search language</label>
            <div className="flex gap-2">
              {(["both", "de", "en"] as const).map((l) => <button type="button" key={l} className={p.language === l ? "chip-on" : "chip-off"} onClick={() => set("language", l)}>{l === "both" ? "DE + EN" : l.toUpperCase()}</button>)}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-ink-600"><input type="checkbox" checked={p.expand} onChange={(e) => set("expand", e.target.checked)} /> Include related titles & German equivalents</label>
          </div>
        </div>

        <div>
          <label className="label">Employment type</label>
          <Chips options={EMPLOYMENT} value={p.employment} onChange={(v) => set("employment", v)} />
        </div>
        <div>
          <label className="label">Work mode</label>
          <Chips options={MODES} value={p.workModes} onChange={(v) => set("workModes", v)} />
        </div>

        <button type="button" className="text-sm font-medium text-isar-700" onClick={() => setShowMore((s) => !s)}>{showMore ? "Fewer filters" : "More filters (experience, salary, industry, date)"}</button>
        {showMore && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Experience level (inferred from job title)</label>
              <Chips options={LEVELS} value={p.experience} onChange={(v) => set("experience", v)} />
            </div>
            <div>
              <label className="label">Minimum salary (€ / year)</label>
              <input className="input" type="number" min={0} step={5000} value={p.minSalary ?? ""} onChange={(e) => set("minSalary", e.target.value ? Number(e.target.value) : null)} placeholder="Only filters jobs that state a salary" />
            </div>
            <div>
              <label className="label">Industry contains</label>
              <input className="input" value={p.industry ?? ""} onChange={(e) => set("industry", e.target.value || null)} placeholder="e.g. Software, Automotive" />
            </div>
            <div>
              <label className="label">Published within</label>
              <select className="input" value={p.publishedWithinDays} onChange={(e) => set("publishedWithinDays", Number(e.target.value))}>
                {[1, 3, 7, 14, 30, 60, 100].map((d) => <option key={d} value={d}>{d === 1 ? "24 hours" : `${d} days`}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Sort by</label>
              <select className="input" value={p.sort} onChange={(e) => { set("sort", e.target.value as Params["sort"]); if (outcome) loadResults(outcome, e.target.value as Params["sort"]); }}>
                <option value="match">CV compatibility</option>
                <option value="date">Publication date</option>
                <option value="relevance">Source relevance</option>
              </select>
            </div>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary px-6 py-2.5" disabled={loading}>{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} {loading ? "Searching sources…" : "Search jobs"}</button>
          {outcome && <button type="button" className="btn-ghost" onClick={() => search()} disabled={loading}><RefreshCw size={16} /> Refresh</button>}
          {outcome && <button type="button" className="btn-ghost" onClick={saveAlert}><BellPlus size={16} /> Save as alert</button>}
        </div>
        {savedMsg && <Notice tone="ok">{savedMsg}</Notice>}
      </form>

      {outcome && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="card p-5 lg:col-span-2">
            <div className="text-sm">
              <b>{outcome.total}</b> vacancies after de-duplication · <b className="text-isar-700">{outcome.newCount} new</b> since your last searches
            </div>
            <div className="mt-2 text-xs text-ink-500">Searched for: {outcome.terms.join(" · ")} {outcome.expandedBy !== "none" && <span>(expanded by {outcome.expandedBy})</span>}</div>
            <ul className="mt-3 space-y-1 text-xs">
              {outcome.reports.map((r) => (
                <li key={r.source} className={clsx(r.status === "ok" ? "text-ink-700" : r.status === "error" ? "text-rose-600" : "text-ink-400")}>
                  {r.status === "ok" ? "✓" : r.status === "error" ? "✕" : "–"} {r.label}: {r.status === "ok" ? `${r.count} listings` : r.message}
                </li>
              ))}
            </ul>
            {ok.length === 0 && <Notice tone="warn">No source answered successfully – results below are from earlier searches.</Notice>}
          </div>
          <div className="card p-5">
            <div className="text-sm font-semibold">Also search manually</div>
            <p className="mt-1 text-xs text-ink-500">These platforms don't allow automated access, so they were <b>not</b> searched. Pre-filled links:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {outcome.deepLinks.map((d) => (
                <a key={d.source} href={d.url} target="_blank" rel="noopener noreferrer" title={d.reason} className="chip-off">{d.label} <ExternalLink size={11} /></a>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        {!outcome && items && items.length > 0 && <div className="mb-3 text-sm font-semibold text-ink-700">Your discovered jobs</div>}
        {items === null ? null : items.length === 0 ? (
          <Empty title={outcome ? "No vacancies matched" : "Start with a job title"}>
            {outcome ? "Try a wider radius, fewer filters, or related titles." : 'Try "Business Development Manager" — results come live from the Bundesagentur für Arbeit and other public feeds.'}
          </Empty>
        ) : (
          <div className="space-y-3">{items.map((j) => <JobCard key={j.jobId} job={j} onChange={(n) => setItems((all) => all!.map((x) => (x.jobId === n.jobId ? n : x)))} />)}</div>
        )}
      </div>
    </>
  );
}
