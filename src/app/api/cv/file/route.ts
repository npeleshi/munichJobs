import { route, requireUser, HttpError } from "@/lib/http";
import { loadCv } from "@/lib/cv/store";

// Lets the user open exactly the file that will be attached.
export const GET = route(async () => {
  const userId = await requireUser();
  const cv = await loadCv(userId);
  if (!cv) throw new HttpError(404, "No CV uploaded");
  return new Response(new Uint8Array(cv.file()), {
    headers: {
      "Content-Type": cv.mimeType,
      "Content-Disposition": `inline; filename="${cv.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
