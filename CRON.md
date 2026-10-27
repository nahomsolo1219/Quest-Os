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

On Thursdays `thursday-lock` and `daily-quick-start` both run at 18:00 Addis. `thursday-lock` runs the quick-start lock itself first, so the result is the same whichever cron fires first (the second quick-start run finds nothing to do).

## Railway setup (one cron service per job)

> **Why the old setup never ran:** the services used image `curlimages/curl` with a start command `sh -c 'curl …'`. That image's entrypoint *is* curl, so Railway handed `sh -c '…'` to curl as arguments and every run only logged `curl: try 'curl --help'`. Use plain **Alpine** (no entrypoint; busybox `wget` with TLS is built in) and call the shell explicitly.

For each row of the table below, one service in the same Railway project (see DEPLOY.md):

1. New → Empty service → name it as in the table (e.g. `cron-thursday-lock`).
2. Settings → Source → **Docker image** `alpine:3.20`.
3. Settings → Deploy → **Custom start command**: the exact command from the table (only the job name changes).
4. Settings → **Cron schedule**: the UTC value from the table.
5. Settings → Deploy → **Restart policy: Never** (a cron run must exit; Railway starts it again at the next schedule).
6. Variables: `CRON_SECRET` = `${{web.CRON_SECRET}}` and `APP_URL` = `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` (reference variables from the app service, here named `web`).

| Service | Image | Start command | Cron (UTC) | Addis |
| --- | --- | --- | --- | --- |
| `cron-tuesday-reminder` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/tuesday-reminder\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 7 * * 2` | Tue 10:00 |
| `cron-thursday-last-call` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/thursday-last-call\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 13 * * 4` | Thu 16:00 |
| `cron-thursday-lock` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/thursday-lock\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 15 * * 4` | Thu 18:00 |
| `cron-friday-shopping` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/friday-shopping\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 5 * * 5` | Fri 08:00 |
| `cron-daily-quick-start` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/daily-quick-start\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 15 * * *` | Daily 18:00 |
| `cron-daily-morning` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/daily-morning\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 3 * * *` | Daily 06:00 |
| `cron-sunday-stock` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/sunday-stock\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 14 * * 0` | Sun 17:00 |
| `cron-daily-renewals` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/daily-renewals\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 6 * * *` | Daily 09:00 |

What the command does: `wget` POSTs (empty body) to the job route with the secret header, `-S` prints the HTTP status line to the log, `-O-` prints the JSON result, then the log ends with `job-exit=0` (success) or a non-zero `job-exit=` (HTTP error such as 401 wrong secret, 404 wrong job name, 5xx, or no connection). The service exits with that code, so a failed call shows as a failed run in Railway.

A run that fails is safe to re-run by hand (Railway: the service → ⋯ → **Run now**, or the curl below): every job is idempotent.

## How to test a cron

1. **Health page (no secret):** open `https://<your-domain>/api/jobs/health`. It lists every job with its schedule, last start and finish (UTC) and `"overdue": true` if the last scheduled time (plus 30 min) passed without a run. The owner Dashboard shows the same as the **Scheduled jobs** card (red = overdue).
2. **Run one now:** in Railway open e.g. `cron-sunday-stock` → **Run now** (or temporarily set its schedule to a minute or two from now, in UTC). The service log must show `HTTP/1.1 200 OK`, a JSON line like `{"job":"sunday-stock","runKey":"2026-10-25","result":{…}}` and `job-exit=0`.
   - `401` → `CRON_SECRET` on the cron service does not match the web service.
   - `404` → typo in the job name.
   - `wget: bad address` / connection refused → `APP_URL` is wrong (must be `https://` + the web service's public domain).
   - Log shows only `curl: try 'curl --help'` → the service still uses the old curl image; switch to `alpine:3.20`.
3. Reload `/api/jobs/health`: the job's `finished` time is the run you just made and `overdue` is false.
4. Put the schedule back to the UTC value in the table.

## Running a job by hand

From any machine with curl:
```
curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" "$APP_URL/api/jobs/daily-quick-start"
```

## Demo copy: nightly reset (`cron-demo-reset`)

Only for the **demo** Railway service (`DEMO_MODE=true`, its own Postgres). The route answers **404** on any app without `DEMO_MODE=true`, so pointing it at production does nothing.

`POST /api/jobs/demo-reset` (header `x-cron-secret`) wipes the demo database and reseeds it for today: demo staff and clients, a locked current week (production sheet, packing list, labels), today's drops in several states, receipts waiting, a quick start, swap requests, check-ins due, community posts and a report. Everyone's tour progress goes with it, so every guided tour starts fresh the next morning.

| Service | Image | Start command | Cron (UTC) | Addis |
| --- | --- | --- | --- | --- |
| `cron-demo-reset` | `alpine:3.20` | `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/demo-reset\"; code=\$?; echo job-exit=\$code; exit \$code"` | `0 0 * * *` | Daily 03:00 |

Variables on `cron-demo-reset`: `CRON_SECRET` = `${{demo.CRON_SECRET}}` and `APP_URL` = `https://${{demo.RAILWAY_PUBLIC_DOMAIN}}` (reference the **demo** app service, not `web`). Restart policy Never. A good run logs `HTTP/1.1 200 OK`, `{"ok":true,…}` and `job-exit=0`.
