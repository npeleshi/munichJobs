// Browser-side fetch helper: JSON in/out, throws Error with the server's message.
export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: Omit<RequestInit, "body"> & { body?: unknown }): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const res = await fetch(url, {
    ...init,
    headers: isForm ? init?.headers : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    body: init?.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status, (data as { details?: unknown }).details);
  return data as T;
}

export const STATUS_LABEL: Record<string, string> = {
  NEW: "New opportunity",
  HIGH_MATCH: "High match",
  PREPARED: "Application prepared",
  READY: "Ready to send",
  SENT: "Application sent",
  INTERVIEW: "Interview scheduled",
  REJECTED: "Rejected",
  OFFER: "Offer received",
};

export const SOURCE_LABEL: Record<string, string> = {
  arbeitsagentur: "Arbeitsagentur",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
};

export function relDate(d: string | Date | null | undefined): string {
  if (!d) return "Date unknown";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(d).toLocaleDateString("de-DE");
}
