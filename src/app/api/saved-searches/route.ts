import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { route, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";
import { searchSchema } from "@/lib/jobs/search";

export const GET = route(async () => {
  const userId = await requireUser();
  return { items: await prisma.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }) };
});

const schema = z.object({
  name: z.string().min(1).max(80),
  params: searchSchema,
  intervalHours: z.number().int().min(1).max(168).default(24),
  notifyInApp: z.boolean().default(true),
  notifyEmail: z.boolean().default(false),
  minScore: z.number().int().min(0).max(100).default(60),
});

export const POST = route(async (req) => {
  const userId = await requireUser();
  const d = schema.parse(await req.json());
  const count = await prisma.savedSearch.count({ where: { userId } });
  if (count >= 20) return Response.json({ error: "Maximum of 20 saved searches." }, { status: 400 });
  return prisma.savedSearch.create({ data: { ...d, params: d.params as unknown as Prisma.InputJsonValue, userId } });
});
