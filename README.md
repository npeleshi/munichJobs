# Isar Jobs – Munich job search & application assistant

Find real vacancies in and around Munich, score them against your CV, find the published recruitment contact, and send a tailored application from **your own** Gmail or Outlook — only when you click **Send**.

```
Find Jobs ─▶ live sources ─▶ dedupe ─▶ CV score ─▶ job page ─▶ contact discovery
                                                     │
                                       AI draft ◀────┘ ─▶ you edit ─▶ Send ─▶ tracked
```

---

## 1. What is real, what needs your keys, what is restricted

| Area | Status |
|---|---|
| **Bundesagentur für Arbeit (Jobbörse)** search + details | ✅ Implemented, no key needed (public API `rest.arbeitsagentur.de`, header `X-API-Key: jobboerse-jobsuche`). Covers the Arbeitsagentur Jobbörse, the largest German job database. |
| **Arbeitnow** (jobs from Greenhouse, SmartRecruiters, JOIN, Recruitee, Personio… company ATS feeds) | ✅ Implemented, no key needed |
| **Adzuna** aggregator | 🔑 Implemented, needs free `ADZUNA_APP_ID/KEY` |
| Title expansion (DE ⇄ EN) | ✅ Built-in dictionary; 🔑 AI expansion with `ANTHROPIC_API_KEY` |
| De-duplication across sources, radius, filters, sort, "new since last search" | ✅ Implemented |
| CV upload (PDF/DOCX), text extraction, AES-256-GCM encryption, replace/delete | ✅ Implemented |
| CV profile extraction, AI match score with explanation (explicit vs inferred requirements, languages, realism) | 🔑 Needs `ANTHROPIC_API_KEY`. A deterministic keyword **estimate** works without it and is always labelled "est." |
| Recruitment e-mail discovery (job ad → application page → company careers/contact/Impressum pages), robots.txt respected, MX check, ATS/portal detection | ✅ Implemented. Never guesses addresses. |
| Personalised e-mail + optional cover letter (PDF), fact-check against your CV | 🔑 Needs `ANTHROPIC_API_KEY` |
| Sending via Gmail API / Microsoft Graph with CV attached | 🔑 Needs Google and/or Microsoft OAuth app (below) |
| Application tracker, notes, statuses, duplicate protection, dashboard | ✅ Implemented |
| Saved searches, scheduled refresh, in-app (+ optional e-mail-to-self) alerts | ✅ Implemented; 🔑 needs `CRON_SECRET` + a scheduler |
| GDPR: data export, CV deletion, full account erasure | ✅ Implemented |
| **LinkedIn, Indeed, StepStone, XING, Glassdoor, Jobware** | ⛔ Restricted by the platforms (no public API / ToS forbid scraping). The app shows **pre-filled official search links** after every search and clearly says these were *not* searched. |
| Counting replies/interviews automatically | 🗓 Planned. Needs inbox *read* scopes (Gmail restricted scope → Google security review). Today you set "Interview / Rejected / Offer" manually. |
| Google Jobs / company-career-site crawling at scale | 🗓 Planned (would need a licensed data provider such as a SERP/jobs API) |

Nothing in the app substitutes mock data: if a source fails, the search result lists it as failed with the error.

---

## 2. Architecture

* **Next.js 14 (App Router) + TypeScript** – UI and API routes in one deployable unit.
* **PostgreSQL + Prisma** – relational data (jobs ↔ users ↔ applications). Works with Supabase/Neon/RDS.
* **NextAuth** – Google / Microsoft OAuth. The same consent grants `gmail.send` / `Mail.Send`, so signing in *is* connecting the mailbox. No inbox read access is requested.
* **Claude API** (plain `fetch`, structured output via forced tool calls) – CV parsing, matching, drafting.
* **Vercel Cron** (or any cron) → `/api/cron/refresh` for scheduled discovery.
* **Security** – AES-256-GCM for CV file/text/profile and OAuth tokens; per-user rate limits; SSRF guard + robots.txt for page fetches; header-injection-safe MIME; send path requires explicit `confirm: true`, has an atomic lock against double sends, and only marks "sent" after the provider accepts the message; security headers; logs redact e-mails and secrets.

```
src/
  app/(app)/…            Dashboard, Find Jobs, High-Match, Saved, Applications, CV, Settings, Job page
  app/api/…              search, jobs, contacts, score, applications (+send), cv, saved-searches, cron, account
  lib/jobs/              sources (arbeitsagentur, arbeitnow, adzuna, deeplinks), normalize/dedupe, expand, search
  lib/cv/                extraction, profile schema, keyword estimate, encrypted storage
  lib/contacts/          e-mail extraction/classification, ATS detection, robots.txt, discovery crawler
  lib/mail/              MIME builder, Gmail/Graph sender, fact-check, cover-letter PDF
  lib/ai.ts, ai-tasks.ts Claude client + prompts
prisma/schema.prisma     data model
tests/                   unit tests (run with plain Node)
```

### Data model (Prisma)
`User` (+ NextAuth `Account` with encrypted tokens) · `Cv` (encrypted file, text, profile) · `Job` (global, de-duplicated by fingerprint, `sources[]`, contact status, ATS) · `Contact` (email, kind, source URL, MX) · `UserJob` (per-user status, saved, notes, quick/AI score, explanation, isNew) · `Application` (unique per user+job, draft → ready → sending → sent/failed, recipient, subject, body, provider, timestamps) · `SavedSearch` · `Notification`.

---

## 3. Setup

Requirements: Node 20+, PostgreSQL 14+.

```bash
cp .env.example .env          # fill in values (see below)
npm install
npx prisma db push            # creates tables
npm run dev                   # http://localhost:3000
npm test                      # unit tests
```

Quick local Postgres: `docker run -d --name pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=munich_jobs -p 5432:5432 postgres:16`

To try the app before OAuth is set up, set `ALLOW_DEV_LOGIN=true` and `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` (dev only – this login cannot send mail).

### 3.1 Anthropic (Claude)
console.anthropic.com → API keys → create → `ANTHROPIC_API_KEY`.

### 3.2 Gmail sending (Google Cloud)
1. console.cloud.google.com → new project → **APIs & Services → Library → enable "Gmail API"**.
2. **OAuth consent screen**: External; add scope `https://www.googleapis.com/auth/gmail.send`; add yourself as a **test user** (while in "Testing" only test users can sign in; refresh tokens of apps in Testing expire after 7 days – publish the app or reconnect weekly).
3. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (and your production URL equivalent).
4. Copy client ID/secret to `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

`gmail.send` is a *sensitive* (not restricted) scope: personal use works in Testing mode; offering the app to the public requires Google's verification.

### 3.3 Outlook sending (Microsoft Entra ID)
1. entra.microsoft.com → **App registrations → New registration**. Supported accounts: "Any Entra ID tenant + personal Microsoft accounts".
2. Redirect URI (Web): `http://localhost:3000/api/auth/callback/azure-ad` (+ production URL).
3. **Certificates & secrets → New client secret** → `AZURE_AD_CLIENT_SECRET`; Application (client) ID → `AZURE_AD_CLIENT_ID`; tenant `common`.
4. **API permissions → Microsoft Graph → Delegated**: `Mail.Send`, `User.Read`, `offline_access`, `openid`, `profile`, `email`.

Note: Graph `sendMail` limits inline attachments to ~3 MB; the app blocks larger CVs for Outlook with a clear message.

### 3.4 Adzuna (optional)
developer.adzuna.com → register → copy App ID/Key.

### 3.5 Scheduled refresh
Set `CRON_SECRET`. On Vercel, `vercel.json` already schedules `/api/cron/refresh` every 3 hours (each saved search still respects its own interval). Elsewhere, call it from any scheduler:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/refresh
```

---

## 4. Deploy (Vercel + Supabase, ~15 min)
1. Create a Supabase project → Settings → Database → copy the pooled connection string into `DATABASE_URL`.
2. Push the repo to GitHub → import in Vercel → add all env vars → set `NEXTAUTH_URL` to the Vercel URL.
3. Add the production OAuth redirect URIs (Google + Microsoft).
4. Run `npx prisma db push` once against the production DB.
5. Region: choose **Frankfurt (fra1)** in Vercel and an EU Supabase region to keep personal data in the EU.

Any Node host (Railway, Fly.io, a VPS with `npm run build && npm start`) works as well; then schedule the cron call externally. For several instances, replace the in-memory rate limiter in `src/lib/ratelimit.ts` with Redis.

---

## 5. Main user journey
1. Sign in with Google or Microsoft → **CV & Profile** → upload PDF/DOCX (analysed by Claude, encrypted).
2. **Find Jobs** → "Business Development Manager" → München, 25 km → **Search jobs**. Live results from each source (with per-source status), de-duplicated, ranked by CV match; top matches auto-evaluated by AI. Restricted boards appear as pre-filled links.
3. Open a job → match explanation; the app searches public sources for the recruitment address and shows it **with its source** (or "Email not found" + portal link, ATS noted).
4. **Generate draft** → edit subject/body/cover letter; fact-check warns about any number not in your CV.
5. **Send Application** → confirmation showing recipient, mailbox and attachment → **Confirm & send**. The application is recorded as sent with timestamp; failures are shown and never marked as sent. Each posting can only be applied to once.

## 6. Privacy notes (GDPR)
* Data minimisation: only send-scope OAuth; no inbox access.
* CVs, extracted text, AI profile and tokens are encrypted at rest; key never stored in the DB.
* Export (`Settings → Export my data`) and erasure (CV only, or the whole account with cascading deletes).
* CV content is sent to the Claude API for analysis/drafting – mention this in your own privacy notice if others use your deployment.
* Recruiter addresses are only collected when published for contact purposes, and only stored per job.

## 7. Testing
`npm test` runs the unit tests with Node's built-in runner (no extra deps): source mapping and query building for Arbeitsagentur/Arbeitnow/Adzuna (with mocked HTTP), dedupe, filters, salary/experience/work-mode parsing, e-mail extraction & classification, ATS/portal detection, robots.txt, MIME building incl. umlauts and header-injection protection, encryption, fact-checking, keyword scoring and rate limiting.

Recommended manual end-to-end check after configuring keys: sign in with Google/Microsoft → upload CV → search "Business Development Manager" → open a job → generate draft → **set the recipient to your own address** via "Or enter an address" → send → check your inbox for the attachment and the Applications page for the record.
