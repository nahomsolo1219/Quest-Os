# Deploying Quest Meals OS

Everything runs in **one Railway project**, deployed from the GitHub repository `nahomsolo1219/Quest-Os`. Services:

| Service | What it is |
| --- | --- |
| `web` | The Next.js app (staff screens, client app, API routes, scheduled job routes) |
| `Postgres` | Railway Postgres (all data, logins and sessions) |
| `Bucket` | Railway Storage Bucket (S3 API) for receipt photos, community photos and avatars |
| `cron-*` | Eight tiny cron services that call the app's job routes (see [CRON.md](CRON.md)) |

Nothing else is needed: no Supabase, Vercel, Firebase or auth provider. Telegram is optional (notifications); without it everything still works in-app.

Do these steps in order. Steps marked **(costs money / needs credentials)** are for Nahom or an owner to do.

## 1. Create the Railway project (needs credentials)

1. Sign in at railway.com → **New Project** → **Deploy from GitHub repo** → pick `nahomsolo1219/Quest-Os`, branch `main`. Railway creates the `web` service. Rename it to `web` (the cron services refer to it by that name).
2. In the project: **+ New → Database → PostgreSQL**. Keep the name `Postgres`.
3. **+ New → Bucket**. Keep the name `Bucket`. Open its **Credentials** tab and note whether it says *virtual-hosted* or *path-style* URLs.

## 2. Configure the `web` service

**Settings → Build / Deploy**

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Pre-deploy command | `npm run db:migrate` (applies new migrations before each release) |
| Start command | `npm start` (listens on `$PORT`) |
| Healthcheck path | `/login` |
| Region | the closest to Addis Ababa Railway offers (e.g. Europe West) |
| Public networking | **Generate Domain** (or attach your own domain, e.g. `app.questmeals.et`) |

**Variables** (Settings → Variables). `${{…}}` are Railway reference variables.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `BETTER_AUTH_SECRET` | a random 32+ character string (`openssl rand -base64 48`). Required: the app refuses to start in production without it. |
| `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` (or your custom domain, with `https://`) |
| `APP_URL` | same as `BETTER_AUTH_URL` (used in notification links) |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | `${{Bucket.ENDPOINT}}` |
| `S3_REGION` | `${{Bucket.REGION}}` |
| `S3_BUCKET` | `${{Bucket.BUCKET}}` |
| `S3_ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` |
| `S3_SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` |
| `S3_FORCE_PATH_STYLE` | `true` only if the bucket's Credentials tab says path-style; otherwise leave unset |
| `FILE_URL_SECRET` | another random string (only used by the local file driver; set it anyway) |
| `CRON_SECRET` | a random string; the cron services send it in `x-cron-secret` |
| `TELEGRAM_BOT_TOKEN` | optional, see step 6 |
| `TELEGRAM_BOT_USERNAME` | optional, the bot's username without `@` |
| `TELEGRAM_WEBHOOK_SECRET` | optional, a random string (letters, digits, `_` and `-` only) |
| `NODE_ENV` | `production` (Railway sets it for `npm start`; keep it) |

Never put any of these in client code or in git. `.env.local` is gitignored; `.env.example` lists the names only. The build check `scripts/check-bundle-secrets.ts` confirms no secret value reaches browser JavaScript.

Deploy. The pre-deploy step creates all tables on the first release.

## 3. Load the reference data (once)

The menu, ingredients (prices empty on purpose), swap table, packages, areas and default settings come from the seed. In the `web` service open **⋯ → Run command** (or `railway run` locally with the project linked):

```
npm run db:seed -- --no-demo
```

`--no-demo` skips the demo users and clients. Running it again is safe: it only inserts what is missing and never overwrites staff edits.

## 4. Create the first owner (first-admin creation)

```
NEW_USER_PASSWORD='choose-a-strong-password' npm run staff:create -- --email=dagi@questmeals.et --name="Dagi Bekele" --roles=owner,coach
```

Repeat for the other staff, for example:

```
NEW_USER_PASSWORD='…' npm run staff:create -- --email=kidus@questmeals.et --name="Kidus Alemu" --roles=owner,coach
NEW_USER_PASSWORD='…' npm run staff:create -- --email=fahim@questmeals.et --name="Fahim Mohammed" --roles=owner
NEW_USER_PASSWORD='…' npm run staff:create -- --email=nebiyou@questmeals.et --name="Nebiyou Tadesse" --roles=operations,delivery
NEW_USER_PASSWORD='…' npm run staff:create -- --email=nutrition@questmeals.et --name="<Nutritionist>" --roles=nutritionist
NEW_USER_PASSWORD='…' npm run staff:create -- --email=kitchen@questmeals.et --name="<Head cook>" --roles=kitchen
```

Roles: `owner`, `operations`, `nutritionist`, `kitchen`, `delivery`, `coach` (a person can hold several). Clients never get accounts this way: they sign up at `/signup`, or operations creates the account from the client page.

Then sign in at `/login` → Staff tab, and as an owner:
1. **Settings → Ingredients**: enter real market prices (birr per kg / litre / piece). Until every ingredient in a client's menu has a price, the app shows "price missing" and will not publish that client's price. Prices also update automatically from the purchase log.
2. **Settings → Pricing / Schedule / Packages / Areas**: check the defaults (drop cost, consult cost, fixed costs, capacity, margin floor, cutoffs, quick-start capacity 5, delivery areas).
3. **Nutrition → Profile table**: the nutritionist reviews the six portion profiles; 7 of the 24 profile-days are flagged at launch because the scale limits (0.6–1.8) can't hit every target; edit those cells.

## 5. Cron services

Create the eight cron services exactly as in [CRON.md](CRON.md) (one per job, image `alpine:3.20`, the exact start command from its table, UTC schedules, restart policy Never). Do not use `curlimages/curl`: its entrypoint is curl, so a `sh -c` start command never runs. After the first scheduled time, `https://<domain>/api/jobs/health` (and the owner Dashboard's Scheduled jobs card) must show each job's last run; see "How to test a cron" in CRON.md. Use the same `CRON_SECRET` and point `APP_URL` at the `web` domain. Test one by hand:

```
curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/jobs/sunday-stock"
```

It returns JSON with `runKey`. Every job is safe to re-run.

## 6. Telegram bot (optional; needs a Telegram account)

1. In Telegram, talk to **@BotFather** → `/newbot` → name "Quest Meals", username e.g. `QuestMealsBot`. Copy the token into `TELEGRAM_BOT_TOKEN` and the username into `TELEGRAM_BOT_USERNAME`. Redeploy `web`.
2. Point the bot at the app (replace the values):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<your-domain>/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
3. Staff and clients link Telegram from their profile/notifications screen ("Connect Telegram"): the deep link carries a one-time token that expires in an hour.
4. Manual check (feature NOT-05): link your own Telegram, then run `daily-quick-start` or confirm a test payment and check the message arrives.

Without a token, notifications stay in-app and nothing breaks.

## 7. Demo data

Never load demo data into production. For a staging environment you can run `npm run db:seed` (with demo); all demo rows are marked `is_demo`. To remove them (users, clients, plans, invoices, payments, orders, community posts, partner entries created by the demo) while keeping reference data:

```
npm run db:remove-demo
```

## 8. Releasing changes

Push to `main` → Railway builds, runs `npm run db:migrate` (pre-deploy), then starts the new version. Schema changes are new SQL migrations in `db/migrations` created with `npm run db:generate`; never edit a committed migration.

Before pushing, run the gate locally: `npm run verify` (typecheck, lint, unit tests, database tests, production build, bundle budget, bundle secret check, e2e tests, week simulation).

## 9. Backups

Railway Postgres → **Backups** tab: enable scheduled backups. Bucket objects are private; there is no public listing.

## Demo copy (`demo` service)

A second app service runs the same code for staff training, with its own Postgres.

| Variable | Value |
| --- | --- |
| `DEMO_MODE` | `true` (never set this on `web`) |
| `DATABASE_URL` | the demo Postgres |
| `CRON_SECRET`, `BETTER_AUTH_SECRET`, `FILE_URL_SECRET` | their own values (not production's) |
| `APP_URL`, `BETTER_AUTH_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` of the demo service |
| `DEMO_REAL_APP_URL` | optional: the real app's URL, linked from the demo banner |
| `TELEGRAM_BOT_TOKEN` | leave empty (with `DEMO_MODE=true` nothing is sent anyway; messages are logged) |

Pre-deploy command: `npm run db:migrate && npm run db:seed` (with `DEMO_MODE=true` the seed adds the tour data for today on a fresh database). With `DEMO_MODE=true` the app shows a lime "Demo copy" banner, a "Try a role" one-tap sign-in on the login page, and logs instead of sending Telegram messages. Add the `cron-demo-reset` service from [CRON.md](CRON.md) so the data and everyone's tour progress reset every night at 03:00 Addis.
