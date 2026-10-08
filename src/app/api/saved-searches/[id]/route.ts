import { z } from "zod";
import { route, requireUser, HttpError } from "@/lib/http";
import { prisma } from "@/lib/db";

type Ctx = { params: { id: string } };

async function own(userId: string, id: string) {
  const s = await prisma.savedSearch.findUnique({ where: { id } });
  if (!s || s.userId !== userId) throw new HttpError(404, "Not found");
  return s;
}

export const PATCH = route<Ctx>(async (req, { params }) => {
  const userId = await requireUser();
  await own(userId, params.id);
  const d = z.object({
    name: z.string().min(1).max(80).optional(),
    intervalHours: z.number().int().min(1).max(168).optional(),
    notifyInApp: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    minScore: z.number().int().min(0).max(100).optional(),
  }).parse(await req.json());
  return prisma.savedSearch.update({ where: { id: params.id }, data: d });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const userId = await requireUser();
  await own(userId, params.id);
  await prisma.savedSearch.delete({ where: { id: params.id } });
  return { ok: true };
});
