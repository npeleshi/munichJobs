// Sends one e-mail through the user's own mailbox (Gmail API or Microsoft Graph)
// using the OAuth tokens obtained at sign-in. Tokens are decrypted only here.
import { prisma } from "../db";
import { decryptString, encryptString } from "../crypto";
import { logger } from "../logger";
import { buildMime, toBase64Url, type Attachment } from "./mime";

export type Provider = "google" | "azure-ad";

export class SendError extends Error {
  constructor(message: string, public reconnect = false) {
    super(message);
  }
}

export async function connectedProviders(userId: string): Promise<Provider[]> {
  const accts = await prisma.account.findMany({ where: { userId, provider: { in: ["google", "azure-ad"] } }, select: { provider: true, scope: true, refresh_token: true } });
  return accts
    .filter((a) => a.refresh_token && (a.provider === "google" ? /gmail\.send/.test(a.scope ?? "") : /mail\.send/i.test(a.scope ?? "")))
    .map((a) => a.provider as Provider);
}

async function accessToken(userId: string, provider: Provider): Promise<string> {
  const acct = await prisma.account.findFirst({ where: { userId, provider } });
  if (!acct?.refresh_token) throw new SendError(`No ${provider === "google" ? "Gmail" : "Outlook"} connection. Connect it in Settings.`, true);
  const now = Math.floor(Date.now() / 1000);
  if (acct.access_token && acct.expires_at && acct.expires_at - 60 > now) return decryptString(acct.access_token);

  const refresh = decryptString(acct.refresh_token);
  const [url, body] =
    provider === "google"
      ? ["https://oauth2.googleapis.com/token", new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: refresh, grant_type: "refresh_token" })]
      : [
          `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID || "common"}/oauth2/v2.0/token`,
          new URLSearchParams({ client_id: process.env.AZURE_AD_CLIENT_ID!, client_secret: process.env.AZURE_AD_CLIENT_SECRET!, refresh_token: refresh, grant_type: "refresh_token", scope: "offline_access Mail.Send User.Read" }),
        ];
  const res = await fetch(url, { method: "POST", body, signal: AbortSignal.timeout(15000) });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    logger.warn("token refresh failed", { provider, error: data.error });
    throw new SendError("Your mailbox authorisation expired or was revoked. Please reconnect it in Settings.", true);
  }
  await prisma.account.update({
    where: { id: acct.id },
    data: {
      access_token: encryptString(data.access_token),
      expires_at: now + (data.expires_in ?? 3600),
      ...(data.refresh_token ? { refresh_token: encryptString(data.refresh_token) } : {}),
    },
  });
  return data.access_token;
}

export async function sendMail(
  userId: string,
  provider: Provider,
  mail: { to: string; subject: string; text: string; attachments: Attachment[] },
): Promise<{ messageId: string | null }> {
  const token = await accessToken(userId, provider);
  if (provider === "google") {
    const raw = toBase64Url(buildMime(mail));
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(30000),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!res.ok) throw new SendError(`Gmail rejected the message: ${data.error?.message ?? res.status}`, res.status === 401 || res.status === 403);
    return { messageId: data.id ?? null };
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: mail.subject,
        body: { contentType: "Text", content: mail.text },
        toRecipients: [{ emailAddress: { address: mail.to } }],
        attachments: mail.attachments.map((a) => ({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: a.filename,
          contentType: a.mimeType,
          contentBytes: a.content.toString("base64"),
        })),
      },
      saveToSentItems: true,
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status !== 202) {
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new SendError(`Outlook rejected the message: ${data.error?.message ?? res.status}`, res.status === 401 || res.status === 403);
  }
  return { messageId: null }; // Graph sendMail returns 202 without an id
}
