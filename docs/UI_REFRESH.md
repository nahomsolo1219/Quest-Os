# UI refresh: brand, ease of use, and scheduled-job fix

This is the brief for the next milestone. Read `CLAUDE.md`, `PROGRESS.md`, `DECISIONS.md`, `docs/ui-brief-common.md` and `git log --oneline -20` first. `SPEC.md` still rules for behaviour; this milestone changes how the app looks and how easy it is to use. It must not change business rules.

Work on branch `ui-refresh`. Open one pull request to `main` at the end. Do not merge it; the owner merges.

## 0. Brand assets

The brand guideline is `docs/brand/Quest Brand Guideline_V01_Oct 2026.pdf` (uploaded by the owner). If `public/brand/` already holds logo files, use them. Otherwise extract them from the PDF:
- `pdftocairo -svg` (or `pdftocairo -png -r 600` per page) on the logo pages; crop each logo variant to its own file. Logos in the PDF are vector, so keep SVG where possible.
- Save to `public/brand/`: `logo-full.svg` (full colour, for light backgrounds), `logo-full-reversed.svg` (lime + white, for dark backgrounds), `logo-mark.svg` (the Q ring with the leaf, no wordmark), plus PNG versions at 512 px.
- Generate from `logo-mark`: `public/icons/icon.svg`, `icon-192.png`, `icon-512.png`, `maskable-512.png` (mark centred in an 80 % safe zone on Deep Forest), `apple-touch-icon.png` (180 px), and `src/app/favicon.ico`.
- Look at every exported file (Read the PNG) before using it. If the PDF is missing, stop and say so in the PR description; do not invent a logo.

### Brand tokens (from the guideline; the PDF wins if it differs)
| Token | Hex | Use |
| --- | --- | --- |
| Deep Forest | `#11301A` | primary: buttons, active nav, headings on light, sidebar background |
| Fresh Lime | `#8BC53F` | accent: highlights, progress, focus ring, active tab on dark |
| Morning Mist | `#F3F9EB` | app background |
| Oat | `#E4DFD0` | secondary surfaces, dividers on mist |
| Charcoal | `#2E3830` | body text |
| Sage | `#7F9473` | muted text, icons, borders |
| Tangerine | `#F28C28` | promotions only, never for status or primary actions |

Font: Inter via `next/font/google` (self-hosted at build, no runtime call): SemiBold (600) for headings, Regular (400) for body, `font-variant-numeric: tabular-nums` for macros, money and counts.

Logo rules: clear space of 1× the mark height on every side. No shadows, recolouring, stretching or effects. Full colour on light backgrounds, reversed (lime + white) on Deep Forest.

Status colours (one `StatusBadge` component, used everywhere): paid / done / delivered = green on light-green; pending / due soon = amber; late / failed / rejected = red; paused / skipped = Sage on Oat. Every badge also carries a word, never colour alone. Check WCAG AA contrast (4.5:1 for text) for each pair; adjust tints, not the brand hexes.

## 1. Changes to build

### Brand and global
1. Replace the orange theme in `src/app/globals.css` with the tokens above (map them onto the shadcn variables: `--primary`, `--accent`, `--ring`, `--background`, `--muted`, `--border`, charts, sidebar). Fix the `.dark` block too: its primary is still stock grey. Update `themeColor` in `src/app/layout.tsx` and the PWA manifest colours in `src/app/manifest.ts`.
2. Logo in the staff sidebar (reversed, on Deep Forest), the staff phone top bar, the client top bar, login, sign-up, the public home and the calculator. Replace favicon and PWA icons.
3. Inter with tabular numbers (update `.stat-number`).
4. One `StatusBadge` in `src/components/shell/` and replace the ~95 hand-set colour classes (`grep -rn "bg-\(amber\|emerald\|red\|green\|orange\)-" src`) with it or with token classes.
5. Add `loading.tsx` skeletons for each area (`/staff`, `/kitchen`, `/delivery`, `/app`) and `error.tsx` + `not-found.tsx` pages in brand style with a way back. Replace every `window.confirm` with a shadcn `AlertDialog` (add the component). Add a short "Undo" (toast action, ~8 s) to rider "Failed" and "Hand over".

### Public
6. Login and sign-up: phone field with a fixed `+251` prefix (the user types 9XXXXXXXX; keep `normalizeEthiopianPhone` as the single source of truth). Staff tab stays email.
7. Calculator: make the selected Sex and Goal choices unmistakable (filled Deep Forest with a check icon).
8. Public home: when signed in, show "Go to my app" (to the right home for the role) instead of "Sign in". Add the logo and a hero area. There are no food photos in the repo: use a brand-colour hero with the mark, and leave a clearly named slot (`public/brand/hero.jpg`, optional) the owner can fill later; do not use stock photos.

### Staff
9. Group the sidebar into sections with lucide icons: **Today** (Dashboard, Today, Notifications) · **Clients & money** (Clients, Payments, Quick starts) · **Kitchen & delivery** (Weekly orders, Purchasing, Kitchen, Stock count, Waste log, Delivery, Pick-up list, My drops) · **Community** · **Admin** (Nutrition, Partners, Settings). Keep role filtering from `nav-config.ts`; hide empty sections. Notifications with the unread count must be visible without scrolling at 1280×720.
10. Staff Today: a to-do list, one row per action with a count and a button (payments to confirm, quick starts to lock, swaps to approve, check-ins due, drops still out, leads to call). Hide rows with zero; when all are zero show "All clear" with the next cutoff countdown.
11. One tab style for all tabbed pages (Nutrition, Purchasing, Community, Settings): underline tabs that scroll horizontally on phones with a fade edge. Settings tabs must not overflow at 1280.
12. Tables become cards below `md` (one card per row with the 3–4 key fields and a "More" disclosure). At `md`+ keep tables, with the first column sticky and horizontal scroll inside the table only. Apply to the nutrition profile table, production, recipes, weekly orders and purchasing.
13. Ingredients settings: default the filter to "Missing price" while any price is missing; one Save per row (not two).
14. Stock count: when the viewer can't edit (owner), show a note "Kitchen or operations staff complete the count" above the read-only list.

### Kitchen and rider
15. Kitchen sheets (production, recipes, packing): larger text (base 18 px on screen), high contrast (Charcoal on white), bigger row spacing, tick boxes ≥ 44 px. Print styles stay A4 and must still fit as before. Rider buttons are already 48 px: keep them.

### Client app
16. Bottom tabs with icons (Today, Menu, Community, Progress, Plan). Move Swaps, Pause and Payments into the Plan tab as clear sections or links; remove the four loose buttons from the bottom of Today. Keep a pay banner on Today when an invoice is due.
17. Today: one hero card at the top: drop status ("Arriving between 6–8 am" / "Delivered" / "Pick up at Adorsi"), a calorie ring of today's total against the client's target, then meals in slot order (breakfast → snack → lunch → dinner).
18. Menu: a horizontal day strip (Mon–Sun of the current menu week, today highlighted) instead of one long list.
19. Deadline countdowns wherever a cutoff matters (Today, Swaps, Pause, Payments, staff Today): "Change by Thu 6 pm · 2 d 7 h left". Compute with `src/domain/time.ts` only (Africa/Addis_Ababa). A small client component may tick the countdown, but the cutoff instant comes from the server.

## 2. Fix the scheduled jobs (not UI, same PR)

None of the 8 Railway cron services has ever run. They use image `curlimages/curl:8.10.1` with start command `sh -c 'curl ...'`; every run logs only `curl: try 'curl --help'...` because the image's curl entrypoint receives the shell command as curl arguments. One service, `cron-tuesday-reminder`, was switched to `alpine:3.20` with `/bin/sh -c "wget -S -O- --header=\"x-cron-secret: $CRON_SECRET\" --post-data= \"$APP_URL/api/jobs/tuesday-reminder\"; echo job-exit=\$?"`, but it has not been proven yet.

In the repo:
- Update `CRON.md` and `DEPLOY.md` with the working setup (image + exact start command per job) and a "how to test a cron" section.
- Add `GET /api/jobs/health` (no secret needed) that returns the last `job_runs` row per job (name, started, finished, ok), so anyone can see whether crons fire. Add it to the owner Dashboard as a small "Scheduled jobs" card (last run per job, red if a job is overdue by its schedule).

You cannot change Railway from the cloud session. Write the exact per-service settings (image, start command, schedule) as a table in the PR description so the owner (or Claude in her chat, which has the Railway connector) can apply them.

## 3. Rules
- Do not change domain logic (`src/domain/`), services' business rules, the database schema or migrations. UI components, layouts, CSS, `nav-config.ts`, new presentational components and the jobs health route are in scope. If a change needs new data from a service, add a read-only function and say so in DECISIONS.md.
- Keep every existing test passing: `npm run verify` must be green at the end.
- Mobile first (390 px), works at 1280 px. Tap targets ≥ 44 px. Every input has a label. Client pages stay under 200 KB first-load JS (`scripts/check-bundle-size.ts`).
- Plain words, short labels. No new hosted services; Railway + GitHub only.
- Append decisions to the END of `DECISIONS.md` as `- D4xx (ui-refresh) …`.

## 4. How to work
1. Run `scripts/init.sh` (local Postgres + seed with demo data + dev server). Demo logins are in `docs/ui-brief-common.md`.
2. **Before:** screenshot every screen at 390 and 1280 px for each role (owner, operations, nutritionist, kitchen, delivery, coach, client) with `scripts/shot.mjs` into `docs/screenshots/before/<area>/`. Look at them.
3. Do section 0, then items 1–5 (they change everything else), then the rest. Use subagents (`ui-builder`, one area each: public, staff, kitchen+delivery, client) once the global pieces (tokens, logo, StatusBadge, shells, dialogs) are committed. Each subagent screenshots its screens at 390 and 1280 and fixes what looks wrong.
4. **After:** the same screenshots into `docs/screenshots/after/<area>/`. Run `qa-tester` over the main flows per role (`npm run test:e2e`), then `spec-reviewer` on the branch for regressions in business rules.
5. `npm run verify` green. Update `PROGRESS.md` and `features.json` (add ids `UI-01`…`UI-19`, `JOB-FIX`).
6. Open the PR: title "UI refresh: Quest brand, easier screens, cron fix". Description: what changed per area with before/after screenshot pairs (link the files), the Railway cron table from section 2, anything you skipped and why.

Commit messages end with the attribution lines in the session's instructions.
