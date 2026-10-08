// AES-256-GCM encryption for CVs, extracted text, profiles and OAuth tokens.
// Key: 32 bytes, base64, in ENCRYPTION_KEY. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]);
}

export function decryptBuffer(blob: Buffer): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

export function encryptString(s: string): string {
  return PREFIX + encryptBuffer(Buffer.from(s, "utf8")).toString("base64");
}

export function decryptString(s: string): string {
  if (!s.startsWith(PREFIX)) return s; // tolerate legacy plaintext
  return decryptBuffer(Buffer.from(s.slice(PREFIX.length), "base64")).toString("utf8");
}

export function encryptOptional(s: string | null | undefined): string | null | undefined {
  return s ? encryptString(s) : s;
}
