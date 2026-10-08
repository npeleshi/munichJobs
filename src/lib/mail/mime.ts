// RFC 5322 / MIME builder for Gmail's users.messages.send (raw, base64url).
import { randomBytes } from "node:crypto";

export interface Attachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface MailInput {
  from?: string;
  to: string;
  subject: string;
  text: string;
  attachments: Attachment[];
  replyTo?: string;
}

/** RFC 2047 encoded-word for non-ASCII headers (umlauts in subjects/names). */
export function encodeHeader(v: string): string {
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

/** RFC 2231 filename parameter + ASCII fallback. */
export function filenameParams(name: string): string {
  const ascii = name.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_") || "attachment";
  if (ascii === name) return `filename="${ascii}"`;
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();

function assertHeaderSafe(v: string) {
  if (/[\r\n]/.test(v)) throw new Error("Header injection attempt blocked");
}

export function buildMime(m: MailInput): string {
  [m.to, m.subject, m.from ?? "", m.replyTo ?? ""].forEach(assertHeaderSafe);
  const boundary = `mja_${randomBytes(12).toString("hex")}`;
  const headers = [
    m.from ? `From: ${m.from}` : null,
    `To: ${m.to}`,
    m.replyTo ? `Reply-To: ${m.replyTo}` : null,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].filter(Boolean);
  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(Buffer.from(m.text, "utf8").toString("base64")),
  ];
  for (const a of m.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.filename.replace(/[^\x20-\x7e]/g, "_")}"`,
      `Content-Disposition: attachment; ${filenameParams(a.filename)}`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(a.content.toString("base64")),
    );
  }
  parts.push(`--${boundary}--`, "");
  return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
}

export const toBase64Url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

export const EMAIL_SYNTAX = /^[^\s@<>()[\],;:"]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/i;
