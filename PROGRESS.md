# Progress

Resume: `pwd`, read this file, `features.json`, `git log --oneline -20`, run `npm test && npm run test:db`.

## Milestone 0 — Foundation (done)
- Next.js 15.5 + TS strict + ESLint + Tailwind 4 + shadcn/ui; Drizzle, Better Auth, S3 SDK, Vitest 4, Playwright 1.56.
- Stack switched to Railway/Drizzle/Better Auth/S3 per updated prompt (DECISIONS D001–D014).
- SPEC.md, PLAN.md, DECISIONS.md, features.json (198), CLAUDE.md, five subagents, scripts (db-start, init, verify), PWA shell.

## Milestone 1 — Data, auth and roles (done, review pending)
- 46 tables / 28 enums (db/schema), migration 0000_init, seed (reference + demo, removable), Better Auth (email + phone/password), authz matrix (~90 permissions). 87 → 93 db tests pass.

## Milestone 2 — Domain engine (done, review pending)
- src/domain: 19 modules, 228 unit tests pass. 7 of 24 profile-days flagged for the nutritionist (clamp limits).
- Engine services (lead): settings, audit, notifications + Telegram, menu loader, portions recompute (wired into seed), pricing quotes, billing, weekly lock, quick-start lock (D017–D019), drops, plans, 8 idempotent jobs + secured route. db/tests/engine.test.ts covers lock idempotency, quick start 17:30 vs 18:30, pause, discount.

## Milestones 3–4 — in progress
- Five ui-builders in parallel: operations, nutrition/owner/settings/dashboard, kitchen/purchasing/delivery, client app + signup, community. Each has its own test DB (questmeals_test_<area>).
- Spec review of M1–M2 running.

## Known issues / next
- After builders: merge, features.json update, spec review, e2e (qa-tester), simulation, hardening, docs.
