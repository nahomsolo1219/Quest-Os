# Progress

Resume: `pwd`, read this file, `features.json`, `git log --oneline -20`, run `npm test && npm run test:db`.

## Milestone 0 — Foundation (done)
- Next.js 15.5 + TS strict + ESLint + Tailwind 4 + shadcn/ui; Drizzle, Better Auth, S3 SDK, Vitest 4, Playwright 1.56.
- Stack switched to Railway/Drizzle/Better Auth/S3 per the updated prompt (DECISIONS D001–D014).
- SPEC.md, PLAN.md, DECISIONS.md, features.json (198), CLAUDE.md, five subagents, scripts (db-start, init, verify), PWA shell.

## Milestone 1 — Data, auth and roles (done)
- 46 tables / 28 enums, migrations 0000–0002, seed (reference + removable demo), Better Auth (email + phone/password, public sign-up endpoints off), authz matrix (~90 permissions), storage adapters (local folder / Railway Bucket).

## Milestone 2 — Domain engine (done)
- src/domain: 19 modules, 231 unit tests. 7 of 24 profile-days flagged for the nutritionist (clamp limits).
- Engine services: pricing, billing, weekly lock, quick-start lock, drops, plans, eight idempotent jobs.

## Milestones 3–5 — Staff app, client app, community, dashboard, jobs (done)
- Built by five ui-builders in parallel (operations; nutrition/owner/settings/dashboard/partners; kitchen/purchasing/delivery; client app + sign-up + Telegram webhook; community).
- Spec reviews after M1–2 (12 gaps) and M3–5 (8 gaps) — all fixed with regression tests (D032–D049).

## Milestone 6 — Simulation, hardening, handover (done, final checks running)
- `npm run simulate:week`: PASS, 108 assertions → docs/simulation-report.md.
- e2e: 14 specs, phone + laptop, ~256 tests; a11y spec enforces labels and 44 px tap targets.
- Performance: per-primitive Radix imports; every client page 106–194 KB first-load JS (`scripts/check-bundle-size.ts`).
- Security: authz tests per role, receipts via signed URLs only, no secrets in browser bundles (`scripts/check-bundle-secrets.ts`), every server action through `runAction` + Zod (`db/tests/actions-scan.test.ts`), job routes behind a timing-safe secret.
- Docs: README.md, DEPLOY.md, CRON.md.
- features.json: 194 passing, 1 deferred (NOT-05 real Telegram message), DOC-01..03 pending the final checks.

## Known issues / notes
- Ingredient prices are empty by design until staff enter them; plans cannot be priced before that.
- Phone layouts: wide tables scroll horizontally inside their card (no page overflow).
