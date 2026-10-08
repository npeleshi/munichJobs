import { route, requireUser } from "@/lib/http";
import { prisma } from "@/lib/db";

export const GET = route(async () => {
  const userId = await requireUser();
  const items = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 });
  return { items, unread: items.filter((n) => !n.read).length };
});

export const PATCH = route(async () => {
  const userId = await requireUser();
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  return { ok: true };
});
