export const STORAGE_PREFIXES = ["receipts", "community", "avatars"] as const;
export type StoragePrefix = (typeof STORAGE_PREFIXES)[number];

export interface StorageAdapter {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Short-lived URL to read a private object. Callers must authorize before asking for one. */
  signedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
