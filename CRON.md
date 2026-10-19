# Scheduled jobs (Railway cron)

All business times are **Africa/Addis_Ababa (UTC+3, no daylight saving)**. Railway cron schedules are in **UTC**, so every Addis time is 3 hours earlier in the schedule below.

Each job is an idempotent route on the app: `POST /api/jobs/<job>` with header `x-cron-secret: $CRON_SECRET`. Running a job twice does not double-lock, double-charge or double-notify (unique keys on orders, order days, invoices, drops and notification dedupe keys; every run is recorded in `job_runs`).

| Job | Addis time | Railway cron (UTC) | What it does |
| --- | --- | --- | --- |
| `tuesday-reminder` | Tuesday 10:00 | `0 7 * * 2` | Reminds every active client: swaps, pauses and payment due by Thursday 18:00 |
| `thursday-last-call` | Thursday 16:00 | `0 13 * * 4` | Last call to clients with unpaid invoices due at the cutoff |
| `thursday-lock` | Thursday 18:00 | `0 15 * * 4` | Locks next week's orders (paid, active clients), creates drops, generates the following invoices, sends ops the summary (locked, skipped for non-payment, paused) |
| `friday-shopping` | Friday 08:00 | `0 5 * * 5` | Sends ops the link to next week's shopping list (needed minus stock) |
| `daily-quick-start` | Every day 18:00 | `0 15 * * *` | Adds paid quick-start clients to the next service day's production sheet and packing list; re-plans missed starts; sends kitchen and ops the counts and the top-up list link |
| `daily-morning` | Every day 06:00 | `0 3 * * *` | Makes sure today's drops exist; sends the kitchen the production sheet link and riders their route link |
| `sunday-stock` | Sunday 17:00 | `0 14 * * 0` | Reminds the kitchen to complete the stock count |
| `daily-renewals` | Every day 09:00 | `0 6 * * *` | Ends expired plans; renewal reminders 5 days and 1 day before a plan ends; check-in reminders on each client's check-in day; daily community Telegram digest |

On Thursdays `thursday-lock` and `daily-quick-start` both run at 18:00 Addis; either order is safe (tested in `db/tests/engine.test.ts`).

## Railway setup (one cron service per job)

For each row, create a service in the same Railway project (see DEPLOY.md):

1. New → Empty service → name it e.g. `cron-thursday-lock`.
2. Settings → Source: Docker image `curlimages/curl:8.10.1` (tiny image with curl).
3. Settings → Deploy → Custom start command:
   ```
   sh -c 'curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/jobs/thursday-lock"'
   ```
4. Settings → Cron schedule: the UTC value from the table (`0 15 * * 4`).
5. Variables: `CRON_SECRET` = `${{web.CRON_SECRET}}` and `APP_URL` = `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` (reference variables from the app service, here named `web`).

A cron run that exits non-zero shows as failed in Railway; check the app logs and re-run the service manually (safe, because the jobs are idempotent).

## Running a job by hand

```
curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/jobs/daily-quick-start"
```
