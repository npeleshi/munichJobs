// Renders the (user-approved) cover letter text as a clean A4 PDF.
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function coverLetterPdf(text: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const size = 11, lineH = 15, margin = 64;
  const [W, H] = [595.28, 841.89];
  const maxW = W - margin * 2;
  // WinAnsi-safe: replace characters the standard font cannot encode
  const safe = text.replace(/[–—]/g, "-").replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'").replace(/[^\x0a\x20-\x7e\xa0-\xff€]/g, "");

  const lines: string[] = [];
  for (const para of safe.split("\n")) {
    if (!para.trim()) { lines.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    lines.push(line);
  }
  let page = doc.addPage([W, H]);
  let y = H - margin;
  for (const l of lines) {
    if (y < margin) { page = doc.addPage([W, H]); y = H - margin; }
    if (l) page.drawText(l, { x: margin, y, size, font });
    y -= lineH;
  }
  return Buffer.from(await doc.save());
}
