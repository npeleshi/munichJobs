"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const devLogin = process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true";
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink-950 p-12 text-white lg:flex">
        <div className="font-display text-3xl">Isar Jobs</div>
        <div>
          <p className="font-display text-4xl leading-tight">Every Munich vacancy that fits your CV — and nothing sent without your click.</p>
          <ul className="mt-8 space-y-2 text-sm text-ink-300">
            <li>• Live listings from the Bundesagentur für Arbeit, ATS feeds and more</li>
            <li>• Honest match scores with the reasons behind them</li>
            <li>• Recruiter e-mails only from public sources, always with the source</li>
            <li>• Drafts you edit and approve, sent from your own Gmail or Outlook</li>
          </ul>
        </div>
        <div className="text-xs text-ink-500">Your CV is encrypted at rest and can be deleted at any time.</div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-ink-500">Sign in with the mailbox you'll send applications from. We only ask for permission to <b>send</b> mail — never to read it.</p>
          <div className="mt-8 space-y-3">
            <button className="btn-primary w-full py-3" onClick={() => signIn("google", { callbackUrl: "/" })}>Continue with Google (Gmail)</button>
            <button className="btn-ghost w-full py-3" onClick={() => signIn("azure-ad", { callbackUrl: "/" })}>Continue with Microsoft (Outlook)</button>
          </div>
          {devLogin && (
            <form className="mt-8 space-y-2 border-t border-ink-200 pt-6" onSubmit={(e) => { e.preventDefault(); signIn("dev", { email, callbackUrl: "/" }); }}>
              <label className="label">Local dev login (cannot send e-mail)</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              <button className="btn-ghost w-full">Sign in for local testing</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
