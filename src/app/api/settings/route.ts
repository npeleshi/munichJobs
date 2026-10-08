import { z } from "zod";
import { route, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";
import { aiConfigured } from "@/lib/ai";
import { adzunaConfigured } from "@/lib/jobs/sources/adzuna";
import { connectedProviders } from "@/lib/mail/send";

export const GET = route(async () => {
  const userId = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, preferredLanguage: true, sendProvider: true, signature: true } });
  const accounts = await prisma.account.findMany({ where: { userId }, select: { provider: true, scope: true } });
  return {
    user,
    mailboxes: {
      connected: await connectedProviders(userId),
      linked: accounts.map((a) => a.provider),
      googleAvailable: Boolean(process.env.GOOGLE_CLIENT_ID),
      microsoftAvailable: Boolean(process.env.AZURE_AD_CLIENT_ID),
    },
    integrations: {
      ai: aiConfigured(),
      aiModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
      arbeitsagentur: true,
      arbeitnow: true,
      adzuna: adzunaConfigured(),
      cron: Boolean(process.env.CRON_SECRET),
    },
  };
});

export const PATCH = route(async (req) => {
  const userId = await requireUser();
  const d = z.object({
    preferredLanguage: z.enum(["auto", "de", "en"]).optional(),
    sendProvider: z.enum(["google", "azure-ad"]).nullable().optional(),
    signature: z.string().max(1000).nullable().optional(),
    name: z.string().max(120).optional(),
  }).parse(await req.json());
  await prisma.user.update({ where: { id: userId }, data: d });
  return { ok: true };
});
