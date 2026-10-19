# Quest Meals OS — notes for Claude Code

Read `PROGRESS.md`, `features.json` and `git log --oneline -20` first. Spec: `SPEC.md` (never edit). Plan: `PLAN.md`. Decisions: `DECISIONS.md`.

## Commands
- `scripts/init.sh` — install, start local Postgres (Docker → local pg → PGlite), migrate, seed, start dev server
- `npm run db:start` / `npm run db:reset` (drop, migrate, seed incl. demo) / `npm run db:migrate` / `npm run db:seed` / `npm run db:remove-demo`
- `npm run typecheck`, `npm run lint`, `npm test` (domain unit tests), `npm run test:db` (needs Postgres), `npm run test:e2e`, `npm run simulate:week`
- `npm run verify` — the single gate (all of the above in order)

## Rules
- Time zone: every business date, cutoff and "today" is Africa/Addis_Ababa, computed only through `src/domain/time.ts`. Store instants in UTC.
- Money is integer birr. Food quantities are integer grams or pieces (base recipe amounts may have one decimal).
- Pure domain logic lives in `src/domain/` — no imports from next, react, drizzle, postgres or node built-ins there.
- Services in `src/server/services/` take `ctx = { db, actor, now }`, authorize first via `src/server/authz/`, call the domain, then save. Never trust the client for prices, limits, cutoffs or roles. Validate inputs with Zod.
- Audit-log changes to prices, settings, nutrition targets, discounts, payment confirmations, moderation.
- No Supabase or other hosted services: Railway (app, Postgres, bucket, cron) + GitHub only.

## Folder ownership
- `db/`, `src/server/authz/` — db-engineer
- `src/domain/` — domain-engineer
- `src/app/`, `src/components/`, `src/server/services/<area>` — ui-builder (one area per instance)
- `e2e/`, `scripts/simulate-week.ts` — qa-tester
