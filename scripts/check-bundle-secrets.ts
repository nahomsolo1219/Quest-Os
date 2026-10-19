// Security check: after `next build`, no server secret may appear in browser JavaScript.
// Scans .next/static for the values of secret env vars and for connection-string patterns.
import "./env";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SECRET_VARS = ["DATABASE_URL", "DATABASE_URL_TEST", "BETTER_AUTH_SECRET", "FILE_URL_SECRET", "CRON_SECRET",
  "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"];
const PATTERNS = [/postgres(ql)?:\/\/[^"'\s]+:[^"'\s]+@/i, /BETTER_AUTH_SECRET/, /S3_SECRET_ACCESS_KEY/];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
  });
}

const dir = path.resolve(".next/static");
const files = walk(dir);
if (files.length === 0) { console.error("No build output. Run `npm run build` first."); process.exit(1); }
const problems: string[] = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const v of SECRET_VARS) {
    const value = process.env[v];
    if (value && value.length >= 8 && text.includes(value)) problems.push(`${path.relative(".", file)} contains the value of ${v}`);
  }
  for (const p of PATTERNS) if (p.test(text)) problems.push(`${path.relative(".", file)} matches ${p}`);
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`check-bundle-secrets: ${files.length} browser files scanned, no secrets found`);
