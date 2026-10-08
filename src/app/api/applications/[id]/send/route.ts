// The ONLY code path that sends an application. It requires an explicit
// request from the signed-in user with confirm=true, sends exactly one e-mail,
// and records the result. Nothing in the app calls this automatically.
import { z } from "zod";
import { route, requireUser, limit, HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadCv } from "@/lib/cv/store";
import { EMAIL_SYNTAX } from "@/lib/mail/mime";
import { coverLetterPdf } from "@/lib/mail/coverpdf";
import { connectedProviders, sendMail, SendError, type Provider } from "@/lib/mail/send";

export const maxDuration = 60;

const schema = z.object({
  confirm: z.literal(true),
  provider: z.enum(["google", "azure-ad"]).optional(),
  acknowledgeGeneralAddress: z.boolean().default(false),
  acknowledgeWarnings: z.boolean().default(false),
});

const OUTLOOK_MAX_ATTACHMENT = 3 * 1024 * 1024; // Graph sendMail inline attachment limit

export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const userId = await requireUser();
  limit(userId, "send", LIMITS.send);
  const input = schema.parse(await req.json());

  const app = await prisma.application.findUnique({ where: { id: params.id }, include: { job: { include: { contacts: true } } } });
  if (!app || app.userId !== userId) throw new HttpError(404, "Application not found");
  if (app.status === "sent") throw new HttpError(409, "Already sent.");
  if (!app.toEmail || !EMAIL_SYNTAX.test(app.toEmail)) throw new HttpError(400, "No valid recipient address. Use the official application portal instead.");

  const contact = app.job.contacts.find((c) => c.email === app.toEmail);
  if ((!contact || contact.kind === "general") && !input.acknowledgeGeneralAddress) {
    throw new HttpError(412, contact ? "The recipient is a general company address, not a recruitment contact. Confirm to send anyway." : "The recipient was entered manually and not found on a public source. Confirm to send anyway.");
  }
  const checks = ((app.warnings as { checks?: unknown[] } | null)?.checks ?? []) as { kind: string }[];
  if (checks.some((c) => c.kind === "unverified_number" || c.kind === "placeholder") && !input.acknowledgeWarnings) {
    throw new HttpError(412, "The draft has unresolved fact-check warnings. Review them, then confirm.");
  }

  const cv = await loadCv(userId);
  if (!cv) throw new HttpError(400, "No CV uploaded – it must be attached.");

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const available = await connectedProviders(userId);
  const provider: Provider | undefined = input.provider ?? (user.sendProvider as Provider | null) ?? available[0];
  if (!provider || !available.includes(provider)) throw new HttpError(412, "Connect Gmail or Outlook in Settings to send applications.");
  const file = cv.file();
  if (provider === "azure-ad" && file.length > OUTLOOK_MAX_ATTACHMENT) throw new HttpError(413, "Outlook only allows attachments up to 3 MB this way. Please upload a smaller CV.");

  // Atomic lock: only one request can move the draft into "sending" (prevents double-clicks).
  const lock = await prisma.application.updateMany({
    where: { id: app.id, status: { in: ["draft", "ready", "failed"] } },
    data: { status: "sending", error: null },
  });
  if (lock.count !== 1) throw new HttpError(409, "This application is already being sent.");

  const attachments = [{ filename: cv.fileName, mimeType: cv.mimeType, content: file }];
  if (app.coverLetter) {
    const name = (cv.profile?.name ?? "Bewerbung").replace(/[^\p{L}\p{N} _-]/gu, "");
    attachments.push({ filename: `${app.language === "de" ? "Anschreiben" : "Cover Letter"} - ${name}.pdf`, mimeType: "application/pdf", content: await coverLetterPdf(app.coverLetter) });
  }

  try {
    const { messageId } = await sendMail(userId, provider, { to: app.toEmail, subject: app.subject, text: app.body, attachments });
    const sentAt = new Date();
    await prisma.$transaction([
      prisma.application.update({ where: { id: app.id }, data: { status: "sent", sentAt, provider, providerMessageId: messageId } }),
      prisma.userJob.update({ where: { userId_jobId: { userId, jobId: app.jobId } }, data: { status: "SENT" } }),
    ]);
    logger.info("application sent", { applicationId: app.id, provider });
    return { ok: true, sentAt, provider };
  } catch (e) {
    const msg = e instanceof SendError ? e.message : "Sending failed unexpectedly. Nothing was marked as sent.";
    await prisma.application.update({ where: { id: app.id }, data: { status: "failed", error: msg } });
    logger.error("application send failed", { applicationId: app.id, provider, err: (e as Error).message });
    throw new HttpError(502, msg, { reconnect: e instanceof SendError ? e.reconnect : false });
  }
});
