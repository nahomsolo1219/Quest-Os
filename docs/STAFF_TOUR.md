# Staff guided tour + demo mode

Brief for the next milestone. Read `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`, `docs/ui-brief-common.md`, `docs/UI_REFRESH.md` and `git log --oneline -20` first. Work on branch `staff-tour`; open one PR to `main` at the end; do not merge it.

## Why
Quest Meals is about to train its staff (owners Dagi, Kidus, Fahim; operations Nebiyou; a nutritionist; kitchen staff; riders; coaches). Each person should learn their own part of the system by being walked through the real screens. A separate demo copy of the app (Railway service `demo`, its own Postgres, env `DEMO_MODE=true`) runs the same code with demo data so staff can practise without touching real clients.

## Part A: guided tour per role

### Behaviour
- On a staff member's first sign-in, the tour for their role starts automatically. People with several roles (e.g. owner + coach) get the owner tour first; the user menu lists every tour they can take.
- "Take the tour" in the staff user menu (sidebar footer at 1280, the menu sheet on phones) restarts it at any time. A small "Tour" chip shows "3 of 9" while running.
- Each step highlights a real element on the real page (spotlight with dimmed background), with a short title, 1–3 plain sentences, and Back / Next / Skip tour. Steps may move to another page; the tour waits for the target element before showing the step and skips it gracefully if the element is missing (e.g. a role cannot see it).
- Works at 390 and 1280 px. On phones the step text sits in a bottom sheet so it never covers the highlighted element; the nav sheet opens automatically when a step points into it.
- Keyboard: Esc closes, arrows move, focus is trapped in the step card; screen readers get the step text (`aria-live`).
- Progress is saved per user (step reached, completed or skipped) so a tour resumes where they left it on another device. This milestone may add one small table (e.g. `tour_progress(user_id, tour_id, step, status, updated_at)`) with a migration; nothing else in the schema changes.
- The last step of every tour is a "Your week" card: the 3–5 things this role does each day/week with links (e.g. kitchen: "Every morning: open today's production sheet → print labels → pack"), plus "Replay this tour any time from the menu."

### Implementation
- Mark targets with `data-tour="<id>"` attributes on existing elements. Do not restructure pages to fit the tour.
- Tour definitions live in one typed file per role in `src/components/tour/tours/` (step id, page path, target, title, body, optional action like "open nav"). Plain-language copy, no jargon; reuse the words in the UI.
- Prefer a small in-house component (spotlight + popover + bottom sheet with existing shadcn pieces). If you use a library, keep it under 10 KB gzipped and check the 200 KB client page budget (`scripts/check-bundle-size.ts`).
- Brand: Deep Forest card, Fresh Lime progress dots, Inter; follow the tokens from the UI refresh.

### What each tour covers (adjust targets to what really exists)
Start every tour with a 1-step welcome and a "How a Quest week works" card: Tue 10:00 reminder → Thu 16:00 last call → **Thu 18:00 cutoff: orders lock, invoices go out** → Fri 08:00 shopping list → Sun 17:00 stock count → every day 06:00 production sheet and rider routes, 18:00 quick-start lock. Times are Addis.

- **Owner**: Dashboard KPIs and the Scheduled jobs card → Today to-do list → Clients (find, open a client, plan, notes) → Payments (confirm a receipt) → Weekly orders (cutoff, lock now) → Settings (packages and pricing, ingredients and prices, delivery areas, swap rules, schedule) → Partners → Community moderation → Audit log ("Changes").
- **Operations**: Today to-do list → new client / lead → onboarding steps → Payments queue (confirm/reject) → Quick starts → Weekly orders + lock → Purchasing (shopping list, record a purchase) → Delivery board (assign riders, see failed drops) → Pick-up list → Notifications.
- **Nutritionist**: Nutrition home → profiles table (portion sizes per profile) → a client's nutrition page (set targets, consultation notes) → check-ins due → swap approvals → Settings › Nutrition.
- **Kitchen**: Cook days → production sheet for a date (what to cook, quantities) → recipes for the date → packing list → labels (print) → stock count → waste log.
- **Delivery (rider)**: My drops (today's route, order) → open a drop → Delivered / Failed (with reason) and the Undo → Hand over → Pick-up list.
- **Coach**: Community feed → post as coach, pin, challenges → reports and moderation → client progress they can see.

## Part B: demo mode (`DEMO_MODE=true`)
The `demo` Railway service already exists with its own database and runs `npm run db:migrate && npm run db:seed` before each deploy (the seed adds the demo data relative to today). Production never sets `DEMO_MODE`; every demo-only path must be a no-op or 404 there.

1. **Banner**: a slim Fresh-Lime bar on every page: "Demo copy. Practice freely: data is fake and resets every night." with a link to the real app.
2. **One-tap sign-in on the login page**: a "Try a role" card listing the demo accounts from `db/seed/demo.ts` (owner, operations, nutritionist, kitchen, rider, coach, and two clients), each signing in with one tap. Only rendered when `DEMO_MODE=true`.
3. **No outside messages**: when `DEMO_MODE=true`, Telegram and any outbound sends are logged instead of sent.
4. **Nightly reset**: `POST /api/jobs/demo-reset` (header `x-cron-secret`, 404 unless `DEMO_MODE=true`) wipes the demo database and reseeds it for today, so dates, cutoffs and drops always look current. Document the Railway cron for it in `CRON.md` (image `alpine:3.20`, same `wget` start command pattern as the other jobs, schedule `0 0 * * *` UTC = 03:00 Addis) so it can be added as service `cron-demo-reset` pointing at the demo app.
5. **Tours start fresh**: on the demo copy, tour progress is reset with the nightly reset so anyone can watch the full tour.
6. Make sure the demo seed covers what every tour step points at for "today": unpaid and pending payments, a quick start, swap requests, check-ins due, a locked week with production/packing/labels, drops in different states, community posts and a report. Extend `db/seed/demo.ts` if something is missing (demo data only; reference data unchanged).

## Rules
- Do not change business rules, services' decisions or `src/domain/`. The one new table and the demo endpoints are the only backend additions.
- `npm run verify` green at the end. Add e2e specs: first-login auto-start, skip, resume, replay from menu, each role's tour reaches its last step at 390 and 1280; demo banner and one-tap sign-in only with `DEMO_MODE=true`; demo-reset returns 404 without it.
- Screenshot every tour step for every role at 390 and 1280 into `docs/screenshots/tour/<role>/` and look at them. Fix anything covered, cut off or confusing.
- Append decisions to the END of `DECISIONS.md` as `- D6xx (staff-tour) …`. Update `PROGRESS.md` and `features.json` (`TOUR-01`… and `DEMO-01`…).
- PR description: what each tour covers, a few step screenshots per role, the demo-reset cron settings, anything skipped and why.

Commit messages end with the attribution lines in the session's instructions.
