import { route, requireUser, limit } from "@/lib/http";
import { LIMITS } from "@/lib/ratelimit";
import { discoverContacts } from "@/lib/contacts/discover";

export const maxDuration = 60;

export const POST = route<{ params: { id: string } }>(async (_req, { params }) => {
  const userId = await requireUser();
  limit(userId, "contacts", LIMITS.contacts);
  return { job: await discoverContacts(params.id) };
});
