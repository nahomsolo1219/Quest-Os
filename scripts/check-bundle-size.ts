// Performance check: gzip first-load JS per client-facing route from the Next build manifest.
// Fails if a client route (/app..., public pages) exceeds the budget.
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

const BUDGET_KB = Number(process.env.QM_JS_BUDGET_KB ?? 200);
const manifestPath = path.resolve(".next/app-build-manifest.json");
if (!existsSync(manifestPath)) { console.error("No build output. Run `npm run build` first."); process.exit(1); }
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { pages: Record<string, string[]> };
const cache = new Map<string, number>();
const size = (f: string) => {
  if (!cache.has(f)) cache.set(f, gzipSync(readFileSync(path.resolve(".next", f))).length);
  return cache.get(f)!;
};
const isClientRoute = (r: string) => r.startsWith("/app/") || r.startsWith("/(public)/") || r === "/page";
const rows = Object.entries(manifest.pages)
  .filter(([route]) => route.endsWith("/page"))
  .map(([route, files]) => ({ route, kb: files.filter((f) => f.endsWith(".js")).reduce((s, f) => s + size(f), 0) / 1024 }))
  .sort((a, b) => b.kb - a.kb);
let failed = false;
for (const r of rows) {
  const over = isClientRoute(r.route) && r.kb > BUDGET_KB;
  if (over) failed = true;
  console.log(`${over ? "OVER" : "ok  "} ${r.kb.toFixed(1).padStart(7)} KB  ${r.route}`);
}
if (failed) { console.error(`Client routes over ${BUDGET_KB} KB first-load JS`); process.exit(1); }
console.log(`check-bundle-size: all client routes within ${BUDGET_KB} KB`);
