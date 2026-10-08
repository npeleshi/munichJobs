import { prisma } from "../db";
import { decryptBuffer, decryptString } from "../crypto";
import type { CvProfile } from "./profile";

export async function loadCv(userId: string) {
  const cv = await prisma.cv.findUnique({ where: { userId } });
  if (!cv) return null;
  return {
    id: cv.id,
    fileName: cv.fileName,
    mimeType: cv.mimeType,
    sizeBytes: cv.sizeBytes,
    analyzedAt: cv.analyzedAt,
    updatedAt: cv.updatedAt,
    text: decryptString(cv.textEnc),
    profile: cv.profileEnc ? (JSON.parse(decryptString(cv.profileEnc)) as CvProfile) : null,
    file: () => decryptBuffer(Buffer.from(cv.fileEnc)),
  };
}

export async function loadProfile(userId: string): Promise<CvProfile | null> {
  const cv = await prisma.cv.findUnique({ where: { userId }, select: { profileEnc: true } });
  return cv?.profileEnc ? (JSON.parse(decryptString(cv.profileEnc)) as CvProfile) : null;
}
