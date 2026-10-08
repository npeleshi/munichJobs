"use client";
import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Notice, PageHeader } from "@/components/ui";
import { ProfileEditor } from "@/components/profile-editor";
import { emptyProfile } from "@/lib/cv/heuristic";
import type { CvProfile } from "@/lib/cv/profile";

type Cv = { fileName: string; sizeBytes: number; analyzedAt: string | null; updatedAt: string; profile: CvProfile | null; textPreview: string };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card p-5"><div className="label">{title}</div><div className="mt-2 text-sm">{children}</div></div>;
}

export default function CvPage() {
  const [cv, setCv] = useState<Cv | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const [aiOn, setAiOn] = useState(false);
  useEffect(() => {
    api<{ cv: Cv | null }>("/api/cv").then((r) => setCv(r.cv));
    api<{ integrations: { ai: boolean } }>("/api/settings").then((r) => setAiOn(r.integrations.ai)).catch(() => undefined);
  }, []);

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
      <PageHeader title="CV & Profile" subtitle="Your CV is encrypted (AES-256-GCM) and only used to score jobs and draft your applications. Fill in your profile below – it drives match scores and drafts." />
      <div
        className="card flex flex-col items-center gap-3 border-2 border-dashed border-ink-200 p-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
      >
        <FileUp className="text-ink-400" />
        {cv ? <div className="text-sm"><b>{cv.fileName}</b> · {(cv.sizeBytes / 1024).toFixed(0)} KB · updated {new Date(cv.updatedAt).toLocaleDateString("de-DE")} · <a className="underline" href="/api/cv/file" target="_blank">open</a></div> : <div className="text-sm text-ink-600">Drop your CV here (PDF or DOCX, max 8 MB)</div>}
        <input ref={input} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => input.current?.click()} disabled={!!busy}>{busy === "upload" ? <><Loader2 size={16} className="animate-spin" /> Reading CV…</> : cv ? "Replace CV" : "Choose file"}</button>
          {cv && aiOn && <button className="btn-ghost" onClick={reanalyze} disabled={!!busy}>{busy === "analyze" ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Re-analyse</button>}
          {cv && <button className="btn-ghost text-rose-600" onClick={remove} disabled={!!busy}><Trash2 size={16} /> Delete</button>}
        </div>
      </div>
      {msg && <div className="mt-4"><Notice tone={msg.tone}>{msg.text}</Notice></div>}

      {cv && <ProfileEditor key={cv.updatedAt + (cv.analyzedAt ?? "")} profile={p ?? emptyProfile()} onSaved={(np) => setCv((c) => c && { ...c, profile: np })} />}
      {p && (p.experience.length > 0 || p.education.length > 0 || p.projects.length > 0) && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {p.experience.length > 0 && <Section title="Experience (from CV)">
            <ul className="space-y-3">{p.experience.map((e, i) => <li key={i}><div className="font-medium">{e.title} · {e.company}</div><div className="text-xs text-ink-500">{[e.start, e.end].filter(Boolean).join(" – ")}</div>{e.highlights.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-600">{e.highlights.slice(0, 4).map((h) => <li key={h}>{h}</li>)}</ul>}</li>)}</ul>
          </Section>}
          {p.education.length > 0 && <Section title="Education (from CV)">
            <ul className="space-y-2">{p.education.map((e, i) => <li key={i}><div className="font-medium">{e.degree}{e.field ? `, ${e.field}` : ""}</div><div className="text-xs text-ink-500">{e.institution}{e.year ? ` · ${e.year}` : ""}</div></li>)}</ul>
          </Section>}
          {p.projects.length > 0 && <Section title="Projects (from CV)"><ul className="space-y-1">{p.projects.map((x) => <li key={x.name}><b>{x.name}</b> — <span className="text-ink-600">{x.description}</span></li>)}</ul></Section>}
        </div>
      )}
    </>
  );
}
