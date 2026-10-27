# Progress

Resume: `pwd`, read this file, `features.json`, `git log --oneline -20`, run `npm test && npm run test:db`.

## Milestone 0 — Foundation (done)
- Next.js 15.5 + TS strict + ESLint + Tailwind 4 + shadcn/ui; Drizzle, Better Auth, S3 SDK, Vitest 4, Playwright 1.56.
- Stack switched to Railway/Drizzle/Better Auth/S3 per the updated prompt (DECISIONS D001–D014).
- SPEC.md, PLAN.md, DECISIONS.md, features.json (198), CLAUDE.md, five subagents, scripts (db-start, init, verify), PWA shell.

## Milestone 1 — Data, auth and roles (done)
- 46 tables / 28 enums, migrations 0000–0004, seed (reference + removable demo), Better Auth (email + phone/password, public sign-up endpoints off), authz matrix (~90 permissions), storage adapters (local folder / Railway Bucket).

## Milestone 2 — Domain engine (done)
- src/domain: 19 modules, 231 unit tests. 7 of 24 profile-days flagged for the nutritionist (clamp limits).
- Engine services: pricing, billing, weekly lock, quick-start lock, drops, plans, eight idempotent jobs.

## Milestones 3–5 — Staff app, client app, community, dashboard, jobs (done)
- Built by five ui-builders in parallel (operations; nutrition/owner/settings/dashboard/partners; kitchen/purchasing/delivery; client app + sign-up + Telegram webhook; community).
- Spec reviews after M1–2 (12 gaps) and M3–5 (8 gaps) — all fixed with regression tests (D032–D049).

## Milestone 6 — Simulation, hardening, handover (done)
- `npm run simulate:week`: PASS, 108 assertions → docs/simulation-report.md.
- e2e: 14 specs, phone + laptop, ~256 tests; a11y spec enforces labels and 44 px tap targets.
- Performance: per-primitive Radix imports; every client page 106–194 KB first-load JS (`scripts/check-bundle-size.ts`).
- Security: authz tests per role, receipts via signed URLs only, no secrets in browser bundles (`scripts/check-bundle-secrets.ts`), every server action through `runAction` + Zod (`db/tests/actions-scan.test.ts`), job routes behind a timing-safe secret.
- Docs: README.md, DEPLOY.md, CRON.md.
- features.json: 197 passing, 1 deferred (NOT-05: a real Telegram message needs a bot token and a live chat).
- Final spec-review passes (D050–D079) closed the remaining billing and lock gaps: per-day delivery option on order days, remainder billing for lengthened periods, re-billing voided periods without double-billing, renewals counted from the start.
- Final gate: clean clone → `QM_NO_DEV=1 bash scripts/init.sh && npm run verify` passes (typecheck, lint, 236 unit, 259 db, e2e phone + laptop, bundle checks, simulation).

## Milestone 7 — UI refresh: Quest brand, easier screens, cron fix (branch `ui-refresh`)
- Brief: docs/UI_REFRESH.md. Decisions D460–D516. `npm run verify` green (e2e 280 passed, simulation PASSED). Loading skeletons only on area home pages (Next 15.5 bug, D515). Features UI-01…UI-19, JOB-FIX.
- Brand assets cut from the guideline PDF into public/brand + public/icons (scripts/brand/). Theme tokens (light + dark), Inter, one StatusBadge, logo everywhere, grouped staff sidebar with icons, page-level skeletons, brand error/not-found pages, AlertDialog confirmations, rider Undo.
- Built by four ui-builders in parallel (public, staff, kitchen+delivery, client): +251 phone field, filled choices, signed-in home + hero; staff Today to-do list, underline tabs, tables → phone cards, ingredients one Save; 18 px kitchen sheets with tick boxes (A4 print unchanged); client Today hero + calorie ring, Plan hub, menu day strip, cutoff countdowns.
- Crons: Alpine + wget start command per job (CRON.md, DEPLOY.md), public `GET /api/jobs/health`, owner Dashboard "Scheduled jobs" card. The Railway services themselves still have to be switched by the owner (table in the PR).
- Screenshots: docs/screenshots/before|after/<area>/<role>--<page>--<width>.jpg (`node scripts/shots-all.mjs <phase>`).
- QA: new e2e/ui-refresh.spec.ts + rider Undo e2e; spec review found 3 undo gaps (fixed, D501); QA found area-level loading.tsx broke same-page ?param links in production (fixed, D513).

## Milestone 8 — Staff guided tour + demo mode (branch `staff-tour`)
- Brief: docs/STAFF_TOUR.md. Decisions D600–D653. Features TOUR-01…TOUR-14, DEMO-01…DEMO-06.
- Tour engine (in-house, src/components/tour/): spotlight, Deep Forest step card (popover at 1280, sheet on phones), page-to-page steps that wait for `data-tour` targets and skip missing ones, menu sheet opening on phones, keyboard and aria-live, progress per user in `tour_progress` (migration 0005), "Take the tour" in the user menu.
- Six tours written by four ui-builders in parallel (owner + coach, operations, nutritionist, kitchen + rider); every step screenshotted at 390 and 1280 in docs/screenshots/tour/<role>/ (`node scripts/tour-shots.mjs <tour>`).
- Demo mode (`DEMO_MODE=true`): banner, Try a role one-tap sign-in, Telegram logged not sent, `POST /api/jobs/demo-reset` (404 otherwise) truncating and reseeding with tour data for today (db/seed/tour-data.ts; `npm run db:reset -- --tour-data` locally). Railway: `cron-demo-reset` in CRON.md; run the reset once after the first deploy (DEPLOY.md).
- QA: e2e/tour.spec.ts (auto-start, skip, resume, replay, keyboard, every role to "Your week" at 390 and 1280), e2e/demo.spec.ts (second web server with DEMO_MODE=true); global setup marks tours skipped for the other specs. Spec review: no gaps.

## Known issues / notes
- Ingredient prices are empty by design until staff enter them; plans cannot be priced before that.
- Phone layouts: wide tables scroll horizontally inside their card (no page overflow).
