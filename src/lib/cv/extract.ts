// Text extraction from uploaded CVs. PDF via pdf-parse, DOCX via mammoth.
// Scanned (image-only) PDFs yield no text – we report that instead of guessing.
import mammoth from "mammoth";
import { fixMojibake } from "./heuristic";

export const ALLOWED_MIME: Record<string, "pdf" | "docx"> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};
export const MAX_CV_BYTES = 8 * 1024 * 1024;

export function sniffType(buf: Buffer): "pdf" | "docx" | null {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "pdf";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "docx"; // ZIP container
  return null;
}

export async function extractCvText(buf: Buffer, kind: "pdf" | "docx"): Promise<string> {
  let text: string;
  if (kind === "pdf") {
    // import the implementation file directly – pdf-parse's index runs a debug harness
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
    text = (await pdfParse(buf)).text;
  } else {
    text = (await mammoth.extractRawText({ buffer: buf })).value;
  }
  text = fixMojibake(text).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < 200) {
    throw new Error("Very little text could be extracted. If this is a scanned PDF, please upload a text-based PDF or DOCX.");
  }
  return text;
}

