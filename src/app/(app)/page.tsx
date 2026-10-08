import Link from "next/link";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { HIGH_MATCH } from "@/lib/jobs/search";
import { PageHeader, ScoreBadge, StatTile } from "@/components/ui";
import { STATUS_LABEL, relDate } from "@/lib/client";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const userId = (await getUserId())!;
  const [total, high, prepared, sent, interviews, offers, fresh, cv, recentApps, pipeline, newCount] = await Promise.all([
    prisma.userJob.count({ where: { userId, hidden: false } }),
    prisma.userJob.count({ where: { userId, OR: [{ aiScore: { gte: HIGH_MATCH } }, { aiScore: null, quickScore: { gte: HIGH_MATCH } }] } }),
    prisma.application.count({ where: { userId, status: { in: ["draft", "ready", "failed"] } } }),
    prisma.application.count({ where: { userId, status: "sent" } }),
    prisma.userJob.count({ where: { userId, status: "INTERVIEW" } }),
    prisma.userJob.count({ where: { userId, status: "OFFER" } }),
    prisma.userJob.findMany({ where: { userId, isNew: true, hidden: false }, orderBy: [{ aiScore: "desc" }, { quickScore: "desc" }], take: 6, include: { job: true } }),
    prisma.cv.findUnique({ where: { userId }, select: { fileName: true, analyzedAt: true } }),
    prisma.application.findMany({ where: { userId, status: "sent" }, orderBy: { sentAt: "desc" }, take: 5, include: { job: { select: { id: true, title: true, company: true } } } }),
    prisma.userJob.groupBy({ by: ["status"], where: { userId }, _count: true }),
    prisma.userJob.count({ where: { userId, isNew: true, hidden: false } }),
  ]);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your Munich job search at a glance." action={<Link href="/jobs" className="btn-accent">Find jobs</Link>} />

      {!cv && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-4 border-isar-500/40 bg-isar-50 p-5">
          <div><div className="font-semibold">Upload your CV to unlock match scores and tailored applications</div><div className="text-sm text-ink-600">PDF or DOCX · encrypted at rest · delete it any time</div></div>
          <Link href="/cv" className="btn-primary">Upload CV</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Vacancies discovered" value={total} />
        <StatTile label="High matches" value={high} hint={`score ≥ ${HIGH_MATCH}`} />
        <StatTile label="Applications prepared" value={prepared} hint="drafts not yet sent" />
        <StatTile label="Applications sent" value={sent} />
        <StatTile label="Interviews" value={interviews} hint="tracked manually" />
        <StatTile label="Offers" value={offers} />
        <StatTile label="New opportunities" value={newCount} hint="not opened yet" />
        <StatTile label="Replies" value="—" hint="needs inbox access (planned)" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-3">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Newly discovered</h2><Link href="/jobs" className="text-sm text-isar-700">All jobs →</Link></div>
          {fresh.length === 0 ? <p className="text-sm text-ink-500">No unseen vacancies. Run a search or save an alert.</p> : (
            <ul className="divide-y divide-ink-100">
              {fresh.map((u) => (
                <li key={u.id} className="flex items-center gap-4 py-3">
                  <ScoreBadge score={u.aiScore ?? u.quickScore} kind={u.aiScore != null ? "ai" : u.quickScore != null ? "estimate" : null} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/jobs/${u.jobId}`} className="block truncate font-medium hover:text-isar-700">{u.job.title}</Link>
                    <div className="truncate text-xs text-ink-500">{u.job.company} · {relDate(u.job.postedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-6 lg:col-span-2">
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Pipeline</h2>
            <ul className="space-y-2 text-sm">
              {Object.entries(STATUS_LABEL).map(([k, v]) => {
                const n = pipeline.find((p) => p.status === k)?._count ?? 0;
                return <li key={k} className="flex justify-between"><span className="text-ink-600">{v}</span><span className="font-semibold tabular-nums">{n}</span></li>;
              })}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="mb-3 font-semibold">Recently sent</h2>
            {recentApps.length === 0 ? <p className="text-sm text-ink-500">Nothing sent yet.</p> : (
              <ul className="space-y-2 text-sm">{recentApps.map((a) => <li key={a.id}><Link href={`/jobs/${a.job.id}`} className="font-medium hover:text-isar-700">{a.job.title}</Link><div className="text-xs text-ink-500">{a.job.company} · {a.sentAt?.toLocaleDateString("de-DE")}</div></li>)}</ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
