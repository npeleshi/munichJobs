// GDPR: data export (Art. 15/20) and erasure (Art. 17).
import { route, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";
import { loadCv } from "@/lib/cv/store";

export const GET = route(async () => {
  const userId = await requireUser();
  const [user, cv, userJobs, applications, savedSearches, notifications] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, createdAt: true, preferredLanguage: true, signature: true } }),
    loadCv(userId),
    prisma.userJob.findMany({ where: { userId }, include: { job: { select: { title: true, company: true, url: true } } } }),
    prisma.application.findMany({ where: { userId } }),
    prisma.savedSearch.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId } }),
  ]);
  const body = JSON.stringify({
    exportedAt: new Date().toISOString(),
    user,
    cv: cv ? { fileName: cv.fileName, uploaded: cv.updatedAt, extractedText: cv.text, profile: cv.profile } : null,
    jobs: userJobs,
    applications,
    savedSearches,
    notifications,
  }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-data.json"', "Cache-Control": "no-store" } });
});

/** Deletes the user and – via cascades – CV, tokens, applications, notes and alerts. */
export const DELETE = route(async () => {
  const userId = await requireUser();
  await prisma.user.delete({ where: { id: userId } });
  return { ok: true };
});
