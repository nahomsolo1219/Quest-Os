// Local-folder storage for development and tests. Files live under STORAGE_LOCAL_DIR and are
// served by /api/files-local only with a valid, unexpired HMAC signature (node:crypto, not hand-rolled).
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageAdapter } from "./types";

function baseDir() {
  return path.resolve(process.env.STORAGE_LOCAL_DIR ?? ".data/storage");
}

function secret() {
  const s = process.env.FILE_URL_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("FILE_URL_SECRET is not set");
  return s;
}

export function signLocal(key: string, expires: number): string {
  return createHmac("sha256", secret()).update(`${key}\n${expires}`).digest("base64url");
}

export function verifyLocal(key: string, expires: number, sig: string, nowMs = Date.now()): boolean {
  if (!Number.isFinite(expires) || expires * 1000 < nowMs) return false;
  const expected = Buffer.from(signLocal(key, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

function safePath(key: string) {
  const full = path.resolve(baseDir(), key);
  if (!full.startsWith(baseDir() + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export const localStorage: StorageAdapter = {
  async put(key, body, contentType) {
    const file = safePath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.type`, contentType);
  },
  async signedUrl(key, expiresInSeconds = 300) {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const q = new URLSearchParams({ key, expires: String(expires), sig: signLocal(key, expires) });
    return `/api/files-local?${q.toString()}`;
  },
  async get(key) {
    try {
      const file = safePath(key);
      const [body, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
      return { body: new Uint8Array(body), contentType };
    } catch {
      return null;
    }
  },
  async delete(key) {
    const file = safePath(key);
    await rm(file, { force: true });
    await rm(`${file}.type`, { force: true });
  },
};
