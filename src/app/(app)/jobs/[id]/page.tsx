"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { ArrowLeft, Bookmark, BookmarkCheck, CheckCircle2, ExternalLink, FileText, Loader2, Mail, RefreshCw, Send, Sparkles } from "lucide-react";
import { api, ApiError, SOURCE_LABEL, STATUS_LABEL, relDate } from "@/lib/client";
import { Notice, ScoreBadge } from "@/components/ui";

type Contact = { id: string; email: string; kind: "named_recruiter" | "careers" | "general"; personName: string | null; sourceUrl: string; sourceLabel: string; mxValid: boolean | null };
type Job = {
  id: string; title: string; company: string; location: string; salaryText: string | null; postedAt: string | null; description: string; url: string; applyUrl: string | null;
  workMode: string | null; employment: string[]; industry: string | null; language: string | null; atsVendor: string | null; contactStatus: string; sources: { source: string; url: string }[]; contacts: Contact[];
};
type Match = {
  score: number; realistic: string; summary: string; whyGoodMatch: string[];
  matchedQualifications: { requirement: string; evidence: string }[];
  missingRequirements: { requirement: string; kind: "explicit" | "inferred"; severity: string }[];
  languageRequirements: { language: string; required: string; kind: "explicit" | "inferred"; satisfied: string; candidateLevel: string | null }[];
  inferredPreferences: string[];
};
type UserJob = { status: string; saved: boolean; notes: string | null; quickScore: number | null; aiScore: number | null; matchJson: Match | null };
type Application = { id: string; subject: string; body: string; coverLetter: string | null; toEmail: string | null; language: string; status: string; error: string | null; sentAt: string | null; provider: string | null; warnings: { checks: { kind: string; message: string }[]; usedFacts: string[] } | null };
type Detail = { job: Job; userJob: UserJob; application: Application | null; sameCompany: { sentAt: string; job: { title: string } }[] };

const KIND_LABEL = { named_recruiter: "Named recruiter", careers: "Recruitment address", general: "General company address" };

export default function JobPage({ params }: { params: { id: string } }) {
  const prepare = useSearchParams().get("prepare") === "1";
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cvName, setCvName] = useState<string | null | undefined>(undefined);
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [lang, setLang] = useState<"auto" | "de" | "en">("auto");
  const [withCover, setWithCover] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [draft, setDraft] = useState<Application | null>(null);
  const [manualTo, setManualTo] = useState("");
  const [ackGeneral, setAckGeneral] = useState(false);
  const [ackWarnings, setAckWarnings] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notes, setNotes] = useState("");
  const appRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Detail>(`/api/jobs/${params.id}`);
    setD(r);
    setDraft(r.application);
    setNotes(r.userJob.notes ?? "");
    return r;
  }, [params.id]);

  useEffect(() => {
    load()
      .then((r) => {
        if (r.job.contactStatus === "unchecked") findContacts();
      })
      .catch((e) => setErr(e.message));
    api<{ cv: { fileName: string } | null }>("/api/cv").then((r) => setCvName(r.cv?.fileName ?? null)).catch(() => setCvName(null));
    api<{ mailboxes: { connected: string[] }; user: { sendProvider: string | null } }>("/api/settings").then((r) => {
      setProviders(r.mailboxes.connected);
      setProvider(r.user.sendProvider && r.mailboxes.connected.includes(r.user.sendProvider) ? r.user.sendProvider : r.mailboxes.connected[0] ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  useEffect(() => {
    if (prepare && d) appRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [prepare, d]);

  const run = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const findContacts = () => run("contacts", async () => { await api(`/api/jobs/${params.id}/contacts`, { method: "POST" }); await load(); });
  const evaluate = () => run("score", async () => { await api(`/api/jobs/${params.id}/score`, { method: "POST" }); await load(); });
  const generate = () => run("generate", async () => {
    const r = await api<{ application: Application }>("/api/applications", { method: "POST", body: { jobId: params.id, language: lang, withCoverLetter: withCover, instructions: instructions || null } });
    setDraft(r.application);
    setAckWarnings(false);
  });
  const saveDraft = (extra: Record<string, unknown> = {}) => run("save", async () => {
    if (!draft) return;
    const r = await api<{ application: Application }>(`/api/applications/${draft.id}`, { method: "PATCH", body: { subject: draft.subject, body: draft.body, coverLetter: draft.coverLetter, ...extra } });
    setDraft(r.application);
  });
  const setRecipient = (toEmail: string | null) => run("save", async () => {
    if (!draft) return;
    const r = await api<{ application: Application }>(`/api/applications/${draft.id}`, { method: "PATCH", body: { toEmail } });
    setDraft(r.application);
    setAckGeneral(false);
  });
  const send = () => run("send", async () => {
    if (!draft) return;
    // persist any unsaved edits first, so exactly what is shown is what gets sent
    await api(`/api/applications/${draft.id}`, { method: "PATCH", body: { subject: draft.subject, body: draft.body, coverLetter: draft.coverLetter, markReady: true } });
    try {
      await api(`/api/applications/${draft.id}/send`, { method: "POST", body: { confirm: true, provider: provider || undefined, acknowledgeGeneralAddress: ackGeneral, acknowledgeWarnings: ackWarnings } });
    } catch (e) {
      setConfirming(false);
      await load();
      throw e instanceof ApiError ? e : new Error("Sending failed.");
    }
    setConfirming(false);
    await load();
  });
  const patchJob = (body: Record<string, unknown>) => run("job", async () => { await api(`/api/jobs/${params.id}`, { method: "PATCH", body }); await load(); });

  if (!d) return <div className="py-20 text-center text-ink-400">{err ?? <Loader2 className="mx-auto animate-spin" />}</div>;
  const { job, userJob } = d;
  const m = userJob.matchJson;
  const contact = job.contacts.find((c) => c.email === draft?.toEmail);
  const recipientIsGeneral = !!draft?.toEmail && (!contact || contact.kind === "general");
  const hardWarnings = draft?.warnings?.checks.filter((c) => c.kind === "unverified_number" || c.kind === "placeholder") ?? [];
  const sent = draft?.status === "sent";
  const canSend = !!draft && !sent && !!draft.toEmail && !!cvName && !!provider && (!recipientIsGeneral || ackGeneral) && (!hardWarnings.length || ackWarnings);

  return (
    <div>
      <Link href="/jobs" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ArrowLeft size={14} /> Back to results</Link>
      {err && <div className="mb-4"><Notice tone="error">{err}</Notice></div>}

      <div className="grid gap-6 xl:grid-cols-2">
        {/* ---------------- left: job ---------------- */}
        <section className="space-y-4">
          <div className="card p-6">
            <div className="flex items-start gap-4">
              <ScoreBadge score={userJob.aiScore ?? userJob.quickScore} kind={userJob.aiScore != null ? "ai" : userJob.quickScore != null ? "estimate" : null} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-2xl leading-tight text-ink-950">{job.title}</h1>
                <div className="mt-1 text-ink-700">{job.company}</div>
                <div className="mt-2 text-xs text-ink-500">{job.location}{job.workMode ? ` · ${job.workMode}` : ""} · {relDate(job.postedAt)}{job.salaryText ? ` · ${job.salaryText}` : ""}{job.industry ? ` · ${job.industry}` : ""}</div>
              </div>
              <button className="btn-ghost px-3" onClick={() => patchJob({ saved: !userJob.saved })} title="Save">{userJob.saved ? <BookmarkCheck size={16} className="text-isar-600" /> : <Bookmark size={16} />}</button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {job.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="chip-off">Listing on {SOURCE_LABEL[s.source] ?? s.source} <ExternalLink size={11} /></a>)}
              {job.applyUrl && <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" className="chip-off">Application page <ExternalLink size={11} /></a>}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <select className="input w-auto" value={userJob.status} onChange={(e) => patchJob({ status: e.target.value })}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k} disabled={k === "SENT" && !sent}>{v}</option>)}
              </select>
              {d.sameCompany.length > 0 && <span className="text-xs text-amber-600">You already applied to {job.company} ({d.sameCompany.map((s) => s.job.title).join(", ")}).</span>}
            </div>
          </div>

          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">CV match</h2>
              <button className="btn-ghost text-xs" onClick={evaluate} disabled={busy === "score"}>{busy === "score" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} {m ? "Re-evaluate" : "Evaluate with AI"}</button>
            </div>
            {!m ? (
              <p className="mt-2 text-sm text-ink-500">{userJob.quickScore != null ? `Keyword estimate: ${userJob.quickScore}/100. Run the AI evaluation for a full explanation.` : "Upload your CV to get match scores."}</p>
            ) : (
              <div className="mt-3 space-y-4 text-sm">
                <p className="text-ink-800">{m.summary} <span className={clsx("ml-1 rounded-full px-2 py-0.5 text-xs font-medium", m.realistic === "strong" || m.realistic === "realistic" ? "bg-isar-100 text-isar-700" : "bg-amber-100 text-amber-600")}>{m.realistic}</span></p>
                {m.whyGoodMatch.length > 0 && <div><div className="label">Why you fit</div><ul className="list-disc space-y-1 pl-5">{m.whyGoodMatch.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                {m.matchedQualifications.length > 0 && <div><div className="label">Matching qualifications</div><ul className="space-y-1">{m.matchedQualifications.map((x) => <li key={x.requirement}><span className="text-isar-700">✓</span> {x.requirement} <span className="text-xs text-ink-400">— {x.evidence}</span></li>)}</ul></div>}
                {m.missingRequirements.length > 0 && <div><div className="label">Missing or unclear</div><ul className="space-y-1">{m.missingRequirements.map((x) => <li key={x.requirement}><span className="text-rose-600">✕</span> {x.requirement} <Tag kind={x.kind} /> {x.severity === "blocker" && <span className="text-xs font-semibold text-rose-600">blocker</span>}</li>)}</ul></div>}
                {m.languageRequirements.length > 0 && <div><div className="label">Languages</div><ul className="space-y-1">{m.languageRequirements.map((x) => <li key={x.language}>{x.satisfied === "yes" ? "✓" : x.satisfied === "no" ? "✕" : "?"} {x.language}: {x.required} <Tag kind={x.kind} /> {x.candidateLevel && <span className="text-xs text-ink-400">(you: {x.candidateLevel})</span>}</li>)}</ul></div>}
                {m.inferredPreferences.length > 0 && <div><div className="label">AI-inferred preferences (not stated in the ad)</div><ul className="list-disc pl-5 text-ink-500">{m.inferredPreferences.map((x) => <li key={x}>{x}</li>)}</ul></div>}
              </div>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Job description</h2>
            <div className="prose-job mt-3 max-h-[600px] overflow-y-auto">{job.description}</div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Notes</h2>
            <textarea className="input mt-3 min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (userJob.notes ?? "") && patchJob({ notes })} placeholder="Interview dates, contacts, thoughts…" />
          </div>
        </section>

        {/* ---------------- right: application ---------------- */}
        <section ref={appRef} className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recipient</h2>
              <button className="btn-ghost text-xs" onClick={findContacts} disabled={busy === "contacts"}>{busy === "contacts" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Search public sources</button>
            </div>
            {busy === "contacts" && <p className="mt-2 text-sm text-ink-500">Checking the job ad, application page and the employer's website…</p>}
            {job.contacts.length > 0 ? (
              <div className="mt-3 space-y-2">
                {job.contacts.map((c) => (
                  <label key={c.id} className={clsx("flex cursor-pointer items-start gap-3 rounded-xl border p-3", draft?.toEmail === c.email ? "border-isar-500 bg-isar-50" : "border-ink-200")}>
                    <input type="radio" className="mt-1" disabled={!draft || sent} checked={draft?.toEmail === c.email} onChange={() => setRecipient(c.email)} />
                    <div className="min-w-0 text-sm">
                      <div className="font-medium">{c.email}{c.personName && <span className="font-normal text-ink-500"> · {c.personName}</span>}</div>
                      <div className="text-xs"><span className={c.kind === "general" ? "text-amber-600" : "text-isar-700"}>{KIND_LABEL[c.kind]}</span> · found on <a className="underline" href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.sourceLabel}</a>{c.mxValid === true && " · domain accepts mail"}</div>
                    </div>
                  </label>
                ))}
              </div>
            ) : job.contactStatus !== "unchecked" && busy !== "contacts" ? (
              <div className="mt-3"><Notice tone="warn"><b>Email not found.</b> No recruitment address is published on the sources we may access. {job.applyUrl || job.url ? <>Apply via the <a className="underline" href={job.applyUrl ?? job.url} target="_blank" rel="noopener noreferrer">official application page</a>.</> : null}</Notice></div>
            ) : null}
            {job.atsVendor && <p className="mt-3 text-xs text-ink-500">This employer uses <b>{job.atsVendor}</b> — they may expect applications through the portal rather than by e-mail.</p>}
            {draft && !sent && (
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manualTo) setRecipient(manualTo); }}>
                <input className="input" type="email" placeholder="Or enter an address you know is correct" value={manualTo} onChange={(e) => setManualTo(e.target.value)} />
                <button className="btn-ghost">Use</button>
              </form>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Application e-mail</h2>
            {cvName === null && <div className="mt-3"><Notice tone="warn">Upload your CV on <Link className="underline" href="/cv">CV & Profile</Link> first.</Notice></div>}
            {!sent && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select className="input w-auto" value={lang} onChange={(e) => setLang(e.target.value as "auto")}>
                  <option value="auto">Language: auto ({job.language === "en" ? "English" : "German"})</option>
                  <option value="de">German</option>
                  <option value="en">English</option>
                </select>
                <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={withCover} onChange={(e) => setWithCover(e.target.checked)} /> Cover letter (PDF)</label>
                <input className="input flex-1" placeholder="Optional instruction, e.g. mention my notice period of 3 months" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                <button className="btn-accent" onClick={generate} disabled={busy === "generate" || !cvName}>{busy === "generate" ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {draft ? "Regenerate" : "Generate draft"}</button>
              </div>
            )}

            {draft && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="label">Subject</label>
                  <input className="input" value={draft.subject} disabled={sent} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} onBlur={() => !sent && saveDraft()} />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea className="input min-h-[300px] font-[inherit] leading-relaxed" value={draft.body} disabled={sent} onChange={(e) => setDraft({ ...draft, body: e.target.value })} onBlur={() => !sent && saveDraft()} />
                </div>
                {draft.coverLetter !== null && (
                  <div>
                    <label className="label">Cover letter (attached as PDF)</label>
                    <textarea className="input min-h-[200px]" value={draft.coverLetter} disabled={sent} onChange={(e) => setDraft({ ...draft, coverLetter: e.target.value })} onBlur={() => !sent && saveDraft()} />
                  </div>
                )}
                {draft.warnings?.checks && draft.warnings.checks.length > 0 && (
                  <Notice tone="warn">
                    <div className="font-semibold">Please check before sending</div>
                    <ul className="mt-1 list-disc pl-5">{draft.warnings.checks.map((w) => <li key={w.message}>{w.message}</li>)}</ul>
                  </Notice>
                )}
                {draft.warnings?.usedFacts && draft.warnings.usedFacts.length > 0 && (
                  <details className="text-xs text-ink-500"><summary className="cursor-pointer">CV facts used in this draft ({draft.warnings.usedFacts.length})</summary><ul className="mt-1 list-disc pl-5">{draft.warnings.usedFacts.map((f) => <li key={f}>{f}</li>)}</ul></details>
                )}
                <div className="flex items-center gap-2 rounded-xl bg-ink-50 p-3 text-sm">
                  <FileText size={16} className="text-ink-500" /> Attachment: {cvName ? <a href="/api/cv/file" target="_blank" className="underline">{cvName}</a> : "none"}{draft.coverLetter !== null && " + cover letter PDF"}
                </div>
              </div>
            )}
          </div>

          {draft && (
            <div className="card p-6">
              {sent ? (
                <div className="flex items-start gap-3 text-sm">
                  <CheckCircle2 className="text-isar-600" />
                  <div><div className="font-semibold">Application sent</div><div className="text-ink-500">to {draft.toEmail} via {draft.provider === "google" ? "Gmail" : "Outlook"} · {draft.sentAt && new Date(draft.sentAt).toLocaleString("de-DE")}</div></div>
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {draft.status === "failed" && draft.error && <Notice tone="error">Last attempt failed: {draft.error} {/reconnect/i.test(draft.error) && <Link href="/settings" className="underline">Open Settings</Link>}</Notice>}
                  {providers.length === 0 ? (
                    <Notice tone="warn">Connect Gmail or Outlook in <Link href="/settings" className="underline">Settings</Link> to send.</Notice>
                  ) : providers.length > 1 ? (
                    <select className="input" value={provider} onChange={(e) => setProvider(e.target.value)}>
                      {providers.map((p) => <option key={p} value={p}>Send from {p === "google" ? "Gmail" : "Outlook"}</option>)}
                    </select>
                  ) : null}
                  {recipientIsGeneral && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={ackGeneral} onChange={(e) => setAckGeneral(e.target.checked)} /> I understand {contact ? "this is a general company address, not a confirmed recruitment contact" : "I entered this address myself; it was not found on a public source"}.</label>}
                  {hardWarnings.length > 0 && <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={ackWarnings} onChange={(e) => setAckWarnings(e.target.checked)} /> I've checked the warnings above and everything in the e-mail is accurate.</label>}
                  {!draft.toEmail && <p className="text-ink-500">Choose a recipient above to enable sending.</p>}
                  {!confirming ? (
                    <button className="btn-primary w-full py-3" disabled={!canSend || !!busy} onClick={() => setConfirming(true)}><Send size={16} /> Send Application</button>
                  ) : (
                    <div className="rounded-xl border border-ink-900 p-4">
                      <div className="font-semibold">Send now?</div>
                      <div className="mt-1 text-ink-600">“{draft.subject}” to <b>{draft.toEmail}</b> from your {provider === "google" ? "Gmail" : "Outlook"} account, with <b>{cvName}</b>{draft.coverLetter !== null ? " and your cover letter" : ""} attached.</div>
                      <div className="mt-3 flex gap-2">
                        <button className="btn-primary flex-1" onClick={send} disabled={busy === "send"}>{busy === "send" ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />} Confirm & send</button>
                        <button className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy === "send"}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Tag({ kind }: { kind: "explicit" | "inferred" }) {
  return <span className={clsx("ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", kind === "explicit" ? "bg-ink-900 text-white" : "border border-dashed border-ink-400 text-ink-500")}>{kind === "explicit" ? "stated" : "inferred"}</span>;
}
