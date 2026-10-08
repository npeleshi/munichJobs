"use client";
import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { api } from "@/lib/client";
import { Notice } from "./ui";
import type { CvProfile } from "@/lib/cv/profile";

// Accepts commas, semicolons, new lines, bullets ("- item") and " - " as separators.
const clean = (x: string) => x.replace(/^[-–•*·]\s*/, "").trim();
const list = (s: string) => [...new Set(s.split(/[,;\n•]|\s[-–]\s/).map(clean).filter(Boolean))];
const LEVEL_RE = /^(a1|a2|b1|b2|c1|c2|native|fluent|basic|intermediate|advanced|mother tongue|muttersprache|fließend|amtare)$/i;
const langs = (s: string) => {
  const out: { language: string; level: string }[] = [];
  for (const raw of list(s)) {
    if (LEVEL_RE.test(raw) && out.length && out[out.length - 1].level === "not specified") {
      out[out.length - 1].level = raw; // "German - B2" → German: B2
      continue;
    }
    const m = raw.match(/^([^:(]+?)\s*[:(]\s*([^)]*)\)?$/);
    out.push(m ? { language: m[1].trim(), level: m[2].trim() || "not specified" } : { language: raw, level: "not specified" });
  }
  return out;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}{hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}</div>;
}

export function ProfileEditor({ profile, onSaved }: { profile: CvProfile; onSaved: (p: CvProfile) => void }) {
  const [f, setF] = useState({
    name: profile.name ?? "",
    headline: profile.headline ?? "",
    years: profile.totalYearsExperience?.toString() ?? "",
    location: profile.location ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    skills: profile.skills.join(", "),
    languages: profile.languages.map((l) => `${l.language}: ${l.level}`).join(", "),
    industries: profile.industries.join(", "),
    interests: profile.careerInterests.join(", "),
    achievements: profile.achievements.join("\n"),
    certifications: profile.certifications.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api<{ profile: CvProfile }>("/api/cv/profile", {
        method: "PUT",
        body: {
          name: f.name || null, headline: f.headline || null, location: f.location || null, email: f.email || null, phone: f.phone || null,
          totalYearsExperience: f.years ? Math.max(0, Math.round(Number(f.years))) : null,
          skills: list(f.skills), languages: langs(f.languages), industries: list(f.industries), careerInterests: list(f.interests),
          achievements: f.achievements.split("\n").map((x) => x.trim()).filter(Boolean), certifications: list(f.certifications),
        },
      });
      onSaved(r.profile);
      setMsg({ tone: "ok", text: "Profile saved. Match scores were updated." });
    } catch (e) {
      const fields = (e as { details?: { fieldErrors?: Record<string, string[]> } }).details?.fieldErrors;
      const which = fields ? Object.keys(fields).join(", ") : "";
      setMsg({ tone: "error", text: which ? `Please check: ${which}` : (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt-6 space-y-4 p-6">
      <div>
        <h2 className="font-semibold">Your profile</h2>
        <p className="mt-1 text-xs text-ink-500">Used for match scores and e-mail drafts. Only write what is true and in your CV — drafts quote these fields directly.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} /></Field>
        <Field label="Current / target role" hint="e.g. Business Development Manager"><input className="input" value={f.headline} onChange={set("headline")} /></Field>
        <Field label="Years of experience"><input className="input" type="number" min={0} max={60} value={f.years} onChange={set("years")} /></Field>
        <Field label="Location"><input className="input" value={f.location} onChange={set("location")} /></Field>
        <Field label="E-mail"><input className="input" value={f.email} onChange={set("email")} /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
      </div>
      <Field label="Skills" hint="Comma-separated. These are matched against every job ad, e.g. B2B sales, Salesforce, contract negotiation, market analysis">
        <textarea className="input min-h-[80px]" value={f.skills} onChange={set("skills")} />
      </Field>
      <Field label="Languages" hint="e.g. German: B2, English: C1, Albanian: native (commas, new lines or dashes all work)">
        <input className="input" value={f.languages} onChange={set("languages")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industries" hint="e.g. SaaS, Automotive, Telecom"><input className="input" value={f.industries} onChange={set("industries")} /></Field>
        <Field label="Job titles you're interested in"><input className="input" value={f.interests} onChange={set("interests")} /></Field>
      </div>
      <Field label="Key achievements" hint="One per line, exactly as in your CV, e.g. Grew B2B revenue by 35% in 2 years">
        <textarea className="input min-h-[90px]" value={f.achievements} onChange={set("achievements")} />
      </Field>
      <Field label="Certifications"><input className="input" value={f.certifications} onChange={set("certifications")} /></Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save profile</button>
    </div>
  );
}
