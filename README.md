# Quest Meals OS

One web app that runs Quest Meals, the meal-prep subscription business cooking out of Adorsi Cafe in Addis Ababa. It covers:

- sign-up, calorie and macro targets
- plans and prices
- receipts and payments
- weekly orders and quick starts
- the kitchen's production sheets, packing lists and labels
- purchasing and stock
- deliveries and pick-ups
- the client app, check-ins and the subscriber community
- the owners' dashboard

It is an installable phone web app (PWA) for clients and staff, with print-ready A4 sheets for the kitchen.

- Specification: [SPEC.md](SPEC.md) · Plan and schema: [PLAN.md](PLAN.md) · Decisions to confirm: [DECISIONS.md](DECISIONS.md)
- Deploying: [DEPLOY.md](DEPLOY.md) · Scheduled jobs: [CRON.md](CRON.md) · Dry-run week: [docs/simulation-report.md](docs/simulation-report.md)

## Stack

Next.js 15 (App Router, TypeScript strict) · Tailwind + shadcn/ui · PostgreSQL with Drizzle ORM · Better Auth (email + password for staff, phone + password for clients) · S3-compatible file storage (Railway Bucket; a local folder in development) · Railway cron · Telegram bot for optional notifications · Vitest and Playwright.

Business rules live in `src/domain/` as pure, tested functions. Services in `src/server/services/` load data, check the caller's permissions (`src/server/authz/`), call the domain and save. All dates and cutoffs are computed in Africa/Addis_Ababa. Money is whole birr.

## Run it locally

Needs Node 20.18+ and either Docker or a local PostgreSQL 16.

```
scripts/init.sh
```

This:

1. installs dependencies;
2. starts Postgres on port 54329 (Docker `postgres:16-alpine`, or a local Postgres, or PGlite as a last resort);
3. creates the databases, applies the migrations and seeds the reference and demo data;
4. starts the dev server at http://localhost:3000.

Ingredient prices start empty, by design: staff enter real market prices. Until they do, the app shows "price missing" and will not publish a client price. To try plans and sign-up locally, set prices in **Settings → Ingredients** as an owner, or log purchases.

Useful commands:

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run db:reset` | Drop, migrate and seed again (demo included; `-- --no-demo`, `-- --today=YYYY-MM-DD`) |
| `npm run db:remove-demo` | Remove all demo data, keep reference data |
| `npm test` | Domain unit tests |
| `npm run test:db` | Database, service, authorization and job tests (uses `DATABASE_URL_TEST`) |
| `npm run test:e2e` | Playwright tests at phone (390 px) and laptop (1280 px) width |
| `npm run simulate:week` | The week-in-the-life dry run; writes `docs/simulation-report.md` |
| `npm run verify` | The full gate: typecheck, lint, unit, database tests, build, bundle checks, e2e, simulation |
| `npm run staff:create` | Create a staff account (see DEPLOY.md) |

## Roles and demo logins

Demo data is created by `npm run db:reset` and is marked `is_demo`.

| Role | What they use | Demo login |
| --- | --- | --- |
| Owner (also coach) | Dashboard, all records, settings, partner log, community coaching | `dagi@questmeals.demo`, `kidus@questmeals.demo` |
| Owner | Dashboard, settings, partner log | `fahim@questmeals.demo` |
| Operations + delivery | Clients, payments, weekly orders, quick starts, purchasing, delivery | `nebiyou@questmeals.demo` |
| Nutritionist | Intake, targets, portion profiles, swap approvals, check-ins | `nutritionist@questmeals.demo` |
| Kitchen | Production sheets, recipe cards, packing lists, labels, stock count, waste | `kitchen@questmeals.demo` |
| Rider | Today's drops, delivered / failed | `rider@questmeals.demo` |
| Client | Today's meals, menu, plan, swaps, pause, payments, progress, community | phones `0911000001` … `0911000009` |

- Staff password: `QuestDemo2026!`
- Client password: `Client2026!`
- `0911000010` is a lead with no account.
- Staff sign in on the **Staff** tab of `/login`; clients use the **Client** tab with their phone number.

## How a week runs in the app

All times are Addis Ababa time.

| When | In the app |
| --- | --- |
| **Tuesday 10:00** | Every active client gets a reminder: swaps, pauses, address changes and payment must be in by Thursday 18:00. |
| **Until Thursday 18:00** | Clients pay by Telebirr, CBE or cash and upload the receipt (**Payments**). Operations confirms each receipt with one tap (**Staff → Payments**). Clients can request swaps up to their plan's limit, pause whole weeks, or change their address; all of it applies from next week. |
| **Thursday 16:00** | Clients with unpaid invoices get a last call. |
| **Thursday 18:00** | Next week locks for every active client whose invoice was confirmed by the cutoff. The lock fixes days, meals, portion profile and swaps, and skips unpaid and paused clients. The drops and the following invoices are created, and operations gets a summary. **Staff → Weekly orders** shows the result, with allergy conflicts in red. |
| **Friday 08:00** | **Staff → Purchasing** has the shopping list: grams needed minus stock on hand, in kg, litres and pieces. |
| **Saturday** | Purchases are logged with supplier and price. The latest price updates each ingredient's cost. |
| **Sunday 17:00** | Reminder to count stock. The kitchen counts with one tap per line (**Kitchen → Stock count**). |
| **Every day 18:00** | New clients who paid by 18:00 (quick start) are added to the next service day's production sheet and packing list. Nothing is cooked in advance. The next morning's top-up purchase list is updated. |
| **Every service day (06:00 onwards)** | The kitchen opens the day's production sheet (total grams of each part by profile), recipe cards, packing list and labels, and prints them on A4. Riders open **My drops** in route order: tap to call, then Delivered or Failed (with a reason). Pick-up clients are handed their bag at the cafe counter (**Pick-up list**). |
| **Every day 09:00** | Renewal reminders go out 5 days and 1 day before a plan ends, and check-in reminders on each client's check-in day. |
| **Every week** | Clients log their weight. The nutritionist logs check-ins and notes, and can adjust targets or portion profiles. Owners watch the dashboard: active clients, MRR, collected vs invoiced, food cost %, margin, on-time deliveries, meal ratings, and clients needing attention. |

Any time, the community feed keeps subscribers going. It has progress posts, coach announcements and Q&A with Dagi and Kidus, weekly challenges with streaks, and meal ratings. Operations moderates it.

## Project layout

```
src/domain/        pure business rules + unit tests (nutrition, portions, pricing, swaps, cutoffs, orders, production, shopping, KPIs, community)
src/server/        auth, authorization, services, jobs, storage, Telegram
src/app/           screens: (public), staff, kitchen, delivery, app (client), api
db/                Drizzle schema, migrations, seed, database tests
e2e/               Playwright tests and screenshots
scripts/           init, db helpers, verify, week simulation, bundle checks
```
