# Decisions

One line per decision the spec did not settle, with the reason. Newest sections at the bottom.

## Stack and environment (milestone 0)

- D001 Stack changed by Nahom mid-build (prompt updated on main): Railway Postgres + Drizzle, Better Auth, Railway Bucket (S3 API), Railway cron. No Supabase, no Supabase shim, no RLS-on-auth.uid(). Reason: all infrastructure on Railway and GitHub only.
- D002 No Supabase scaffolding had been created before the change (only Next.js + shadcn/ui), so nothing needed removing.
- D003 Libraries used instead of hand-rolled code (Nahom's instruction): date-fns-tz for Addis time, React Hook Form + Zod for forms, TanStack Table for staff lists, browser-image-compression for photo uploads, Better Auth for auth, password hashing and sessions, AWS S3 SDK presigner for signed URLs.
- D004 Next.js pinned to 15.5 (App Router, React 19). Reason: stable, well-known APIs; Next 16 adds churn with no benefit here.
- D005 `.npmrc` sets `legacy-peer-deps=true`. Reason: better-auth declares optional peers for other frameworks (SvelteKit wants vite 8) that clash with vitest's vite range; none of them are used.
- D006 Local database: Docker is available in this environment (daemon started manually), so `scripts/db-start.sh` runs `postgres:16-alpine` in Docker on port 54329. Fallbacks in order: a local Postgres 16 install (`pg_ctl`), then PGlite through `@electric-sql/pglite-socket`. Same Drizzle migrations everywhere.
- D007 Files: `STORAGE_DRIVER=local` (default in dev/test) stores files under `.data/storage/` and serves them through an HMAC-signed, short-lived route; `STORAGE_DRIVER=s3` uses the Railway Bucket with presigned GET URLs (5 minutes). Every read goes through an authorization check before a URL is issued.
- D008 The browser never talks to the database or the bucket directly. All reads and writes go through server components, server actions and route handlers, which call `src/server/authz/` and then services. Reason: one enforcement point; no secrets or SQL client in the bundle; less JavaScript on 3G.
- D009 Business logic lives in services (`src/server/services/`) that take `(ctx: { db, actor, now })` so the same code runs from server actions, job routes, tests and the week simulation with a fake clock.
- D010 Project subagents are written to `.claude/agents/`; because agent definitions load at session start, this session runs them as general-purpose subagents briefed with the exact content of those files.

## Auth and roles

- D011 Staff sign in with email + password (Better Auth emailAndPassword). Clients sign in with phone number + password through Better Auth's phone-number plugin with `requireVerification: false` (no SMS). Each client user gets a synthetic, non-deliverable email `<e164 digits>@clients.questmeals.invalid` because Better Auth requires an email column.
- D012 Staff reset a client's password from the client page; the new password is hashed with Better Auth's own password hasher (`ctx.password.hash`) and written to the client's credential account. No hand-rolled crypto.
- D013 Roles are a text array on the user (`owner`, `operations`, `nutritionist`, `kitchen`, `delivery`, `coach`, `client`). "Coach" is modelled as a role in the set because the spec calls Dagi and Kidus owners "flagged as coaches"; a flag in the role set is the same thing and keeps one permission check.
- D014 Better Auth user ids are UUIDs (`advanced.database.generateId: "uuid"`), stored as `uuid` columns so every table keys on UUIDs.

## Domain interpretations (milestone 0, see PLAN.md section 7)

- D015 Cook date = drop date. Daily and three-drops clients get each service day cooked that day; Sunday's meals are cooked and dropped Saturday when Sunday is not a service day (`sundayWithSaturday`, default on, because the spec's rotation includes Sunday C).
- D016 Only daily delivery and pick-up are enabled by default, matching the package table. Three-drops and every-3-days can be enabled by an owner. Weekly delivery stays in the pricing table (4.33 drops) but cannot be enabled while the freshness rule is 3 days, because a weekly drop would break "delivered no more than 3 days after cooking".
- D017 Quick-start period: from the start date to the end of the week that the first weekly cutoff after the quick-start lock will lock. Example: paid Friday → starts Saturday and is billed through the end of next week, because next week was already locked on Thursday. This extends "service days left in the current week" so a late-week quick start never falls between cycles.
- D018 Quick-start capacity counts reserved starts (issued or paid quick-start invoices) per start date; a full date pushes to the next service date with room.
- D019 When a quick-start payment is confirmed after the 18:00 lock it was quoted for, the start moves to the next available date, the period is recomputed and any difference is kept as an account credit (or amount owed) applied to the next invoice.
- D020 Unpaid = not cooked, per day: at a lock, a meal day is included only if a paid invoice covers it; a week with no covered day is `skipped_unpaid`.
- D021 Billing periods: weekly invoices cover Monday–Sunday; monthly invoices cover calendar months from the start date. Full month = plan price − monthly discount; any other period = round to nearest 10 of (plan price − discount) × service days ÷ 26. The next period's invoice is generated at the Thursday lock that precedes the cutoff it is due at.
- D022 Subscription term defaults to 1 month (1–4 allowed); renewal extends the end date by the term (automatic renewal is phase 2). Price locks for 4 months from the subscription start.
- D023 Body weight stored as integer grams; age stored as entered at intake (whole years).
- D024 Base recipe amounts are numeric with one decimal (the spec has 13.5 g oil); profile portions, stock and purchases are integer grams or pieces.
- D025 On-time delivery = drop marked delivered on its drop date at or before the delivery deadline setting (default 12:00 Addis).
- D026 Savory snack alternative uses 2 eggs, 100 g cucumber and mitmita (seasoning); the cucumber weight was not in the spec.
- D027 Extra protein add-on is a standing add-on per meal slot (applies to that slot's meal every day), priced per portion with the spec formula and added to the client's food cost.
