// Scheduled discovery: re-runs due saved searches, records new vacancies and
// notifies the user. It NEVER prepares-and-sends applications on its own.
import { prisma } from "./db";
import { logger } from "./logger";
import { runSearch, searchSchema } from "./jobs/search";
import { connectedProviders, sendMail } from "./mail/send";

export async function runDueSavedSearches(now = new Date()) {
  const all = await prisma.savedSearch.findMany({ include: { user: { select: { id: true, email: true, sendProvider: true } } } });
  const due = all.filter((s) => !s.lastRunAt || now.getTime() - s.lastRunAt.getTime() >= s.intervalHours * 3600_000 - 60_000);
  const summary: { id: string; newJobs: number; error?: string }[] = [];

  for (const s of due) {
    try {
      const params = searchSchema.parse(s.params);
      const out = await runSearch(s.userId, params);
      await prisma.savedSearch.update({ where: { id: s.id }, data: { lastRunAt: now } });
      const fresh = await prisma.userJob.findMany({
        where: { userId: s.userId, jobId: { in: out.jobIds }, firstSeenAt: { gte: new Date(now.getTime() - 5 * 60_000) } },
        include: { job: true },
      });
      const relevant = fresh.filter((u) => (u.aiScore ?? u.quickScore ?? 0) >= s.minScore);
      summary.push({ id: s.id, newJobs: fresh.length });
      if (!relevant.length) continue;

      const title = `${relevant.length} new match${relevant.length > 1 ? "es" : ""} for "${s.name}"`;
      const lines = relevant.slice(0, 10).map((u) => `• ${u.job.title} – ${u.job.company} (${u.aiScore ?? u.quickScore}%)`);
      if (s.notifyInApp) {
        await prisma.notification.create({ data: { userId: s.userId, title, body: lines.join("\n"), link: "/jobs?filter=new" } });
      }
      if (s.notifyEmail && s.user.email) {
        // Digest to the user's OWN address via their connected mailbox.
        const providers = await connectedProviders(s.userId);
        const provider = (s.user.sendProvider as "google" | "azure-ad" | null) ?? providers[0];
        if (provider && providers.includes(provider)) {
          await sendMail(s.userId, provider, {
            to: s.user.email,
            subject: `Job alert: ${title}`,
            text: `${lines.join("\n")}\n\nOpen ${process.env.NEXTAUTH_URL ?? ""}/jobs to review. No applications were sent.`,
            attachments: [],
          }).catch((e) => logger.warn("alert email failed", { err: (e as Error).message }));
        }
      }
    } catch (e) {
      logger.error("saved search failed", { id: s.id, err: (e as Error).message });
      summary.push({ id: s.id, newJobs: 0, error: (e as Error).message });
    }
  }
  return { ran: due.length, summary };
}
