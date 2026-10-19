import { randomUUID } from "node:crypto";
import { localStorage } from "./local";
import { s3Storage } from "./s3";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, type StorageAdapter, type StoragePrefix } from "./types";

export * from "./types";

/** Selected by STORAGE_DRIVER: "s3" in production (Railway Bucket), "local" otherwise. */
export function storage(): StorageAdapter {
  return process.env.STORAGE_DRIVER === "s3" ? s3Storage : localStorage;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Builds a key like receipts/<ownerId>/<uuid>.jpg. The owner id segment is what authorization checks. */
export function newKey(prefix: StoragePrefix, ownerId: string, contentType: string): string {
  return `${prefix}/${ownerId}/${randomUUID()}.${EXT[contentType] ?? "bin"}`;
}

export function parseKey(key: string): { prefix: StoragePrefix; ownerId: string } | null {
  const m = /^(receipts|community|avatars)\/([0-9a-f-]{36})\/[0-9a-f-]{36}\.(jpg|png|webp)$/.exec(key);
  return m ? { prefix: m[1] as StoragePrefix, ownerId: m[2] } : null;
}

export class UploadError extends Error {}

/** Validates an uploaded image (type and size) and stores it. */
export async function putImage(prefix: StoragePrefix, ownerId: string, file: File): Promise<string> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new UploadError("Upload a JPG, PNG or WebP photo.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("The photo is larger than 5 MB.");
  const key = newKey(prefix, ownerId, file.type);
  await storage().put(key, new Uint8Array(await file.arrayBuffer()), file.type);
  return key;
}
