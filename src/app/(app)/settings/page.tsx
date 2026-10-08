"use client";
import { useEffect, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { CheckCircle2, Circle, Download, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Notice, PageHeader } from "@/components/ui";

type Settings = {
  user: { email: string; name: string | null; preferredLanguage: string; sendProvider: string | null; signature: string | null };
  mailboxes: { connected: string[]; linked: string[]; googleAvailable: boolean; microsoftAvailable: boolean };
  integrations: { ai: boolean; aiModel: string; arbeitsagentur: boolean; arbeitnow: boolean; adzuna: boolean; cron: boolean };
};
type Saved = { id: string; name: string; intervalHours: number; notifyInApp: boolean; notifyEmail: boolean; minScore: number; lastRunAt: string | null };

const Row = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
  <li className="flex items-start gap-3 py-2">{ok ? <CheckCircle2 size={18} className="mt-0.5 text-isar-600" /> : <Circle size={18} className="mt-0.5 text-ink-300" />}<div><div className="text-sm font-medium">{label}</div><div className="text-xs text-ink-500">{hint}</div></div></li>
);

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    api<Settings>("/api/settings").then(setS);
    api<{ items: Saved[] }>("/api/saved-searches").then((r) => setSaved(r.items));
  };
  useEffect(load, []);

  const update = async (body: Record<string, unknown>) => {
    await api("/api/settings", { method: "PATCH", body });
    setMsg("Saved.");
    load();
  };
  const patchSaved = async (id: string, body: Record<string, unknown>) => {
    await api(`/api/saved-searches/${id}`, { method: "PATCH", body });
    load();
  };

  if (!s) return null;
  const has = (p: string) => s.mailboxes.connected.includes(p);

  return (
    <>
      <PageHeader title="Settings" />
      {msg && <div className="mb-4"><Notice tone="ok">{msg}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Mailboxes for sending</h2>
          <p className="mt-1 text-xs text-ink-500">OAuth permission to <b>send</b> only. We cannot read your inbox. Tokens are encrypted at rest.</p>
          <div className="mt-4 space-y-3">
            {[["google", "Gmail", s.mailboxes.googleAvailable], ["azure-ad", "Outlook / Microsoft 365", s.mailboxes.microsoftAvailable]].map(([id, label, available]) => (
              <div key={id as string} className="flex items-center justify-between rounded-xl border border-ink-200 p-3">
                <div className="text-sm"><div className="font-medium">{label}</div><div className="text-xs text-ink-500">{has(id as string) ? "Connected – can send" : available ? "Not connected" : "Not configured by the server admin"}</div></div>
                <div className="flex gap-2">
                  {has(id as string) && s.mailboxes.connected.length > 1 && <button className={s.user.sendProvider === id ? "chip-on" : "chip-off"} onClick={() => update({ sendProvider: id })}>Default</button>}
                  {available && <button className="btn-ghost text-xs" onClick={() => signIn(id as string, { callbackUrl: "/settings" })}>{has(id as string) ? "Reconnect" : "Connect"}</button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Application preferences</h2>
          <label className="label mt-4">Default e-mail language</label>
          <select className="input" value={s.user.preferredLanguage} onChange={(e) => update({ preferredLanguage: e.target.value })}>
            <option value="auto">Match the job advertisement</option>
            <option value="de">Always German</option>
            <option value="en">Always English</option>
          </select>
          <label className="label mt-4">Signature (appended to every draft)</label>
          <textarea className="input min-h-[100px]" defaultValue={s.user.signature ?? ""} onBlur={(e) => e.target.value !== (s.user.signature ?? "") && update({ signature: e.target.value || null })} placeholder={"Max Mustermann\n+49 170 1234567\nlinkedin.com/in/…"} />
        </section>

        <section className="card p-6 lg:col-span-2">
          <h2 className="font-semibold">Job alerts</h2>
          <p className="mt-1 text-xs text-ink-500">Saved searches are re-run automatically{s.integrations.cron ? "" : " once CRON_SECRET and a scheduler are configured"}. You're notified about new vacancies above your minimum score. Applications are never sent automatically.</p>
          {saved.length === 0 ? <p className="mt-4 text-sm text-ink-500">No alerts yet — use “Save as alert” after a search.</p> : (
            <div className="mt-4 divide-y divide-ink-100">
              {saved.map((x) => (
                <div key={x.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <div className="min-w-[180px] flex-1"><div className="font-medium">{x.name}</div><div className="text-xs text-ink-500">Last run: {x.lastRunAt ? new Date(x.lastRunAt).toLocaleString("de-DE") : "never"}</div></div>
                  <select className="input w-auto" value={x.intervalHours} onChange={(e) => patchSaved(x.id, { intervalHours: Number(e.target.value) })}>
                    {[3, 6, 12, 24, 48, 168].map((h) => <option key={h} value={h}>Every {h < 24 ? `${h} h` : h === 168 ? "week" : `${h / 24} day${h > 24 ? "s" : ""}`}</option>)}
                  </select>
                  <label className="flex items-center gap-1">min score <input className="input w-16" type="number" min={0} max={100} defaultValue={x.minScore} onBlur={(e) => patchSaved(x.id, { minScore: Number(e.target.value) })} /></label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={x.notifyEmail} onChange={(e) => patchSaved(x.id, { notifyEmail: e.target.checked })} /> e-mail me</label>
                  <button className="btn-ghost text-rose-600" onClick={async () => { await api(`/api/saved-searches/${x.id}`, { method: "DELETE" }); load(); }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Integrations status</h2>
          <ul className="mt-2">
            <Row ok={s.integrations.arbeitsagentur} label="Bundesagentur für Arbeit" hint="Public Jobbörse API – no key needed." />
            <Row ok={s.integrations.arbeitnow} label="Arbeitnow" hint="Free ATS job feed – no key needed." />
            <Row ok={s.integrations.adzuna} label="Adzuna" hint="Needs ADZUNA_APP_ID and ADZUNA_APP_KEY (free at developer.adzuna.com)." />
            <Row ok={s.integrations.ai} label={`Claude AI (${s.integrations.aiModel})`} hint={s.integrations.ai ? "AI CV analysis, explained scores and tailored drafts are on." : "Optional (paid per use). Free mode is active: keyword scores from your profile + template drafts."} />
            <Row ok={s.integrations.cron} label="Scheduled refresh" hint="Needs CRON_SECRET and a scheduler calling /api/cron/refresh." />
            <Row ok={false} label="LinkedIn, Indeed, StepStone, XING, Glassdoor, Jobware" hint="No permitted automated access – pre-filled search links are shown with each search." />
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="font-semibold">Your data (GDPR)</h2>
          <p className="mt-1 text-xs text-ink-500">Export everything we store about you, or erase your account. Deletion removes your CV, tokens, drafts, notes and alerts immediately.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a className="btn-ghost" href="/api/account"><Download size={16} /> Export my data</a>
            <button className="btn-ghost text-rose-600" onClick={async () => {
              if (!confirm("Delete your account and all data permanently? This cannot be undone.")) return;
              await api("/api/account", { method: "DELETE" });
              signOut({ callbackUrl: "/signin" });
            }}><Trash2 size={16} /> Delete account</button>
          </div>
        </section>
      </div>
    </>
  );
}
