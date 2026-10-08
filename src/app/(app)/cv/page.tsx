"use client";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Notice, PageHeader } from "@/components/ui";
import type { CvProfile } from "@/lib/cv/profile";

type Cv = { fileName: string; sizeBytes: number; analyzedAt: string | null; updatedAt: string; profile: CvProfile | null; textPreview: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card p-5"><div className="label">{title}</div><div className="mt-2 text-sm">{children}</div></div>;
}
const Pills = ({ items }: { items: string[] }) => items.length ? <div className="flex flex-wrap gap-1.5">{items.map((s) => <span key={s} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs">{s}</span>)}</div> : <span className="text-ink-400">Not found in CV</span>;

export default function CvPage() {
  const [cv, setCv] = useState<Cv | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { api<{ cv: Cv | null }>("/api/cv").then((r) => setCv(r.cv)); }, []);

  const upload = async (file: File) => {
    setBusy("upload");
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api<{ cv: Cv; analysisError: string | null }>("/api/cv", { method: "POST", body: fd });
      setCv(r.cv);
      setMsg(r.analysisError ? { tone: "warn", text: r.analysisError } : { tone: "ok", text: "CV uploaded and analysed. Match scores were refreshed." });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };
  const reanalyze = async () => {
    setBusy("analyze");
    try {
      const r = await api<{ profile: CvProfile }>("/api/cv/analyze", { method: "POST" });
      setCv((c) => c && { ...c, profile: r.profile, analyzedAt: new Date().toISOString() });
    } catch (e) { setMsg({ tone: "error", text: (e as Error).message }); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!confirm("Permanently delete your CV, extracted text and profile?")) return;
    await api("/api/cv", { method: "DELETE" });
    setCv(null);
    setMsg({ tone: "ok", text: "Your CV and all derived data were deleted." });
  };

  const p = cv?.profile;
  return (
    <>
      <PageHeader title="CV & Profile" subtitle="Your CV is encrypted (AES-256-GCM) and only used to score jobs and draft your applications." />
      <div
        className="card flex flex-col items-center gap-3 border-2 border-dashed border-ink-200 p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      >
        <FileUp className="text-ink-400" />
        {cv ? <div className="text-sm"><b>{cv.fileName}</b> · {(cv.sizeBytes / 1024).toFixed(0)} KB · updated {new Date(cv.updatedAt).toLocaleDateString("de-DE")} · <a className="underline" href="/api/cv/file" target="_blank">open</a></div> : <div className="text-sm text-ink-600">Drop your CV here (PDF or DOCX, max 8 MB)</div>}
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => input.current?.click()} disabled={!!busy}>{busy === "upload" ? <><Loader2 size={16} className="animate-spin" /> Reading & analysing…</> : cv ? "Replace CV" : "Choose file"}</button>
          {cv && <button className="btn-ghost" onClick={reanalyze} disabled={!!busy}>{busy === "analyze" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-analyse</button>}
          {cv && <button className="btn-ghost text-rose-600" onClick={remove} disabled={!!busy}><Trash2 size={16} /> Delete</button>}
        </div>
      </div>
      {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {cv && !p && <div className="mt-6"><Notice tone="warn">The CV is stored but hasn't been analysed by AI yet. Configure ANTHROPIC_API_KEY and click Re-analyse.</Notice></div>}
      {p && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <Section title="Summary">
            <div className="font-semibold">{p.name ?? "—"}</div>
            <div className="text-ink-600">{p.headline}</div>
            <div className="mt-1 text-xs text-ink-500">{[p.location, p.seniority && `${p.seniority} level`, p.totalYearsExperience != null && `${p.totalYearsExperience} yrs experience`].filter(Boolean).join(" · ")}</div>
          </Section>
          <Section title="Languages">{p.languages.length ? p.languages.map((l) => <div key={l.language}>{l.language} — <span className="text-ink-500">{l.level}</span></div>) : <span className="text-ink-400">Not found in CV</span>}</Section>
          <Section title="Experience">
            <ul className="space-y-3">{p.experience.map((e, i) => <li key={i}><div className="font-medium">{e.title} · {e.company}</div><div className="text-xs text-ink-500">{[e.start, e.end].filter(Boolean).join(" – ")}</div>{e.highlights.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-600">{e.highlights.slice(0, 4).map((h) => <li key={h}>{h}</li>)}</ul>}</li>)}</ul>
          </Section>
          <Section title="Education">
            <ul className="space-y-2">{p.education.map((e, i) => <li key={i}><div className="font-medium">{e.degree}{e.field ? `, ${e.field}` : ""}</div><div className="text-xs text-ink-500">{e.institution}{e.year ? ` · ${e.year}` : ""}</div></li>)}</ul>
          </Section>
          <Section title="Skills"><Pills items={p.skills} /></Section>
          <Section title="Industries"><Pills items={p.industries} /></Section>
          <Section title="Certifications"><Pills items={p.certifications} /></Section>
          <Section title="Career interests"><Pills items={p.careerInterests} /></Section>
          <Section title="Projects">{p.projects.length ? <ul className="space-y-1">{p.projects.map((x) => <li key={x.name}><b>{x.name}</b> — <span className="text-ink-600">{x.description}</span></li>)}</ul> : <span className="text-ink-400">Not found in CV</span>}</Section>
          <Section title="Achievements">{p.achievements.length ? <ul className="list-disc space-y-1 pl-5">{p.achievements.map((a) => <li key={a}>{a}</li>)}</ul> : <span className="text-ink-400">Not found in CV</span>}</Section>
        </div>
      )}
    </>
  );
}
