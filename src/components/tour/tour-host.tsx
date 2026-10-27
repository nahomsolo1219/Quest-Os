"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TourId, TourProgressMap, TourStatus } from "@/lib/tours";
import { saveTourProgressAction } from "@/app/staff/tour/actions";
import { TOURS } from "./tours";
import type { TourContext, TourStep } from "./types";
import { RUN_KEY, PAUSED_KEY, TOUR_NAV_EVENT, TOUR_START_EVENT, TOUR_STATE_EVENT, type TourStartDetail } from "./events";

/** `seen`: pages already resolved for steps (so Back into a "follow the link" step goes to the same page). */
type Run = { tourId: TourId; step: number; dir: 1 | -1; href?: string; seen?: Record<number, string> };
type Phase = "idle" | "navigating" | "waiting" | "show";

const WAIT_MS = 6000;
const PHONE_MAX = 767;

function readRun(): Run | null {
  try { const v = sessionStorage.getItem(RUN_KEY); return v ? (JSON.parse(v) as Run) : null; } catch { return null; }
}
function writeRun(r: Run | null) {
  try { if (r) sessionStorage.setItem(RUN_KEY, JSON.stringify(r)); else sessionStorage.removeItem(RUN_KEY); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(TOUR_STATE_EVENT, { detail: r }));
}
function isPaused() { try { return sessionStorage.getItem(PAUSED_KEY) === "1"; } catch { return false; } }
function setPaused(v: boolean) { try { if (v) sessionStorage.setItem(PAUSED_KEY, "1"); else sessionStorage.removeItem(PAUSED_KEY); } catch { /* ignore */ } }

/** First visible element with data-tour=id (phone and laptop layouts may both render one). */
export function findTarget(id: string): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
  }
  return null;
}

/** The step's page; null when it follows a link that is not on this page and has no fallback (skip the step). */
function resolveHref(step: TourStep, c: TourContext): string | undefined | null {
  const p = step.path;
  if (!p) return undefined;
  if (typeof p === "string") return p;
  if (typeof p === "function") return p(c);
  const el = findTarget(p.hrefOf) ?? document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(p.hrefOf)}"]`);
  const a = el?.closest("a") ?? el?.querySelector("a");
  const href = a?.getAttribute("href");
  if (href) return href;
  if (p.else) return typeof p.else === "function" ? p.else(c) : p.else;
  return null;
}

function isPhone() { return window.innerWidth <= PHONE_MAX; }

/**
 * Runs the guided tour for the signed-in staff member: spotlight on a real element, a step card
 * (popover on laptops, bottom/top sheet on phones), Back / Next / Skip, progress saved per user.
 * Mounted once by the staff and client shells; state survives page changes in sessionStorage.
 */
export function TourHost({ tours, progress, ctx }: { tours: TourId[]; progress: TourProgressMap; ctx: TourContext }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [run, setRun] = useState<Run | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [rect, setRect] = useState<DOMRect | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; width: number; sheet?: "top" | "bottom" } | null>(null);

  const def = run ? TOURS[run.tourId] : null;
  const step = def && run ? def.steps[run.step] : undefined;
  const total = def?.steps.length ?? 0;

  const save = useCallback((tourId: TourId, stepIdx: number, status: TourStatus) => {
    void saveTourProgressAction({ tourId, step: stepIdx, status }).catch(() => {});
  }, []);

  const update = useCallback((r: Run | null) => { setRun(r); writeRun(r); }, []);

  /** Moves to step `idx` of the current tour; resolves the next page from the current one first. */
  const goTo = useCallback((tourId: TourId, idx: number, dir: 1 | -1) => {
    const d = TOURS[tourId];
    if (idx < 0) idx = 0;
    if (idx >= d.steps.length) return;
    const seen = run?.tourId === tourId ? { ...(run.seen ?? {}) } : {};
    const resolve = (i: number) => {
      const p = d.steps[i].path;
      // going back into a step that followed a link: reuse the page it went to
      if (p && typeof p === "object" && seen[i]) return seen[i];
      return resolveHref(d.steps[i], ctx);
    };
    let href = resolve(idx);
    // a step that follows a link which is not here: skip it now rather than wait for its target
    while (href === null) {
      const next = idx + dir;
      if (next < 0 || next >= d.steps.length) { href = undefined; break; }
      idx = next;
      href = resolve(idx);
    }
    if (href) seen[idx] = href;
    update({ tourId, step: idx, dir, href: href ?? undefined, seen });
    save(tourId, idx, "started");
  }, [ctx, run, save, update]);

  const close = useCallback((status: TourStatus | "paused") => {
    if (run) {
      if (status === "paused") setPaused(true);
      else save(run.tourId, status === "completed" ? total - 1 : run.step, status);
    }
    window.dispatchEvent(new CustomEvent(TOUR_NAV_EVENT, { detail: { open: false } }));
    update(null);
    setPhase("idle");
  }, [run, save, total, update]);

  // Start: resume this tab's run, or start the first tour on first sign-in, or resume one left on another device.
  useEffect(() => {
    const r = readRun();
    if (r && TOURS[r.tourId] && tours.includes(r.tourId)) { setRun(r); return; }
    if (isPaused() || tours.length === 0) return;
    const first = tours[0];
    const p = progress[first];
    if (!p) goTo(first, 0, 1);
    else if (p.status === "started") goTo(first, Math.min(p.step, TOURS[first].steps.length - 1), 1);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Take the tour" from the menu.
  useEffect(() => {
    const onStart = (e: Event) => {
      const { tourId, step = 0 } = (e as CustomEvent<TourStartDetail>).detail;
      if (!tours.includes(tourId)) return;
      setPaused(false);
      goTo(tourId, step, 1);
    };
    window.addEventListener(TOUR_START_EVENT, onStart);
    return () => window.removeEventListener(TOUR_START_EVENT, onStart);
  }, [goTo, tours]);

  // Navigate to the step's page, open the phone menu if needed, then wait for the target.
  useEffect(() => {
    if (!run || !step) return;
    let cancelled = false;
    const here = pathname + (search.toString() ? `?${search.toString()}` : "");
    if (run.href) {
      const want = new URL(run.href, window.location.origin);
      const samePath = want.pathname === pathname;
      const sameSearch = !want.search || want.search === (search.toString() ? `?${search.toString()}` : "");
      if (!samePath || !sameSearch) {
        setPhase("navigating");
        if (here !== run.href) router.push(run.href);
        return;
      }
    }
    const phone = isPhone();
    window.dispatchEvent(new CustomEvent(TOUR_NAV_EVENT, { detail: { open: phone && step.action === "open-nav" } }));
    if (!step.target) { targetRef.current = null; setRect(null); setPhase("show"); return; }
    setPhase("waiting");
    const started = Date.now();
    const poll = () => {
      if (cancelled) return;
      const el = findTarget(step.target!);
      if (el) {
        targetRef.current = el;
        el.style.scrollMarginTop = "88px";
        el.style.scrollMarginBottom = "24px";
        el.scrollIntoView({ block: phone ? "start" : "center", behavior: "instant" as ScrollBehavior });
        setRect(el.getBoundingClientRect());
        setPhase("show");
        return;
      }
      if (Date.now() - started > WAIT_MS) {
        // the element is not on this page for this person (role, empty list…): skip the step quietly
        const next = run.step + run.dir;
        if (next >= 0 && next < (def?.steps.length ?? 0)) goTo(run.tourId, next, run.dir);
        else if (run.dir < 0) goTo(run.tourId, run.step + 1, 1);
        else close("completed");
        return;
      }
      window.setTimeout(poll, 120);
    };
    // give the nav sheet / page a frame to render
    window.setTimeout(poll, step.action === "open-nav" && phone ? 350 : 60);
    return () => { cancelled = true; };
  }, [run, step, pathname, search, router, def, goTo, close]);

  // Keep the spotlight on the target while the page scrolls or resizes.
  useEffect(() => {
    if (phase !== "show" || !step?.target) return;
    let raf = 0;
    const tick = () => {
      const el = targetRef.current;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        setRect((old) => (old && Math.abs(old.top - r.top) < 0.5 && Math.abs(old.left - r.left) < 0.5 && Math.abs(old.width - r.width) < 0.5 && Math.abs(old.height - r.height) < 0.5 ? old : r));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, step]);

  // Place the card: a sheet on phones (bottom, or top when the target is low), a popover next to the target on laptops.
  useLayoutEffect(() => {
    if (phase !== "show") { setCardPos(null); return; }
    const card = cardRef.current;
    const vw = window.innerWidth, vh = window.innerHeight;
    const h = card?.offsetHeight ?? 280;
    if (vw <= PHONE_MAX) {
      const low = rect ? rect.top + rect.height / 2 > vh * 0.5 : false;
      setCardPos({ top: low ? 8 : vh - h - 8, left: 8, width: vw - 16, sheet: low ? "top" : "bottom" });
      return;
    }
    const width = Math.min(380, vw - 32);
    if (!rect) { setCardPos({ top: Math.max(16, (vh - h) / 2), left: (vw - width) / 2, width }); return; }
    const gap = 14;
    let top: number, left: number;
    if (rect.bottom + gap + h <= vh - 8) { top = rect.bottom + gap; left = rect.left; }
    else if (rect.top - gap - h >= 8) { top = rect.top - gap - h; left = rect.left; }
    else if (rect.right + gap + width <= vw - 8) { top = rect.top; left = rect.right + gap; }
    else if (rect.left - gap - width >= 8) { top = rect.top; left = rect.left - gap - width; }
    else { top = vh - h - 16; left = vw - width - 16; }
    left = Math.min(Math.max(8, left), vw - width - 8);
    top = Math.min(Math.max(8, top), vh - h - 8);
    setCardPos({ top, left, width });
  }, [phase, rect, run?.step]);

  // Focus the card on each step; keyboard: Esc closes, arrows move, Tab stays inside the card.
  useEffect(() => {
    if (phase !== "show" || !run) return;
    const card = cardRef.current;
    card?.querySelector<HTMLElement>("[data-tour-primary]")?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); close("paused"); }
      else if (e.key === "ArrowRight") { e.preventDefault(); if (run.step + 1 < total) goTo(run.tourId, run.step + 1, 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (run.step > 0) goTo(run.tourId, run.step - 1, -1); }
      else if (e.key === "Tab" && card) {
        const f = Array.from(card.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        if (f.length === 0) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [phase, run, total, goTo, close]);

  if (!run || !step || !def) return null;
  const last = run.step === total - 1;
  const pad = 6;
  const spot = rect && phase === "show"
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  return (
    <div className="no-print" data-tour-overlay>
      {/* swallow clicks on the page while the tour runs */}
      <div className="fixed inset-0 z-[69]" aria-hidden onClick={(e) => e.preventDefault()} />
      {spot ? (
        <div aria-hidden className="pointer-events-none fixed z-[70] rounded-xl ring-2 ring-lime transition-all duration-200"
          style={{ ...spot, boxShadow: "0 0 0 9999px rgb(12 31 17 / 0.62)" }} />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] bg-[rgb(12_31_17/0.62)]" />
      )}
      <div aria-live="polite" className="sr-only">{phase === "show" ? `${step.title}. ${step.body}` : ""}</div>
      {phase === "show" ? (
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-body"
          data-tour-card
          data-tour-step={step.id}
          className={cn(
            "fixed z-[71] flex max-h-[min(70dvh,560px)] flex-col rounded-2xl bg-forest p-4 text-mist shadow-2xl outline-none",
            !cardPos && "invisible",
          )}
          style={cardPos ? { top: cardPos.top, left: cardPos.left, width: cardPos.width } : { top: 0, left: 0, width: 360 }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-semibold text-forest tabular" data-tour-chip>
              Tour · {run.step + 1} of {total}
            </span>
            <button type="button" onClick={() => close("paused")} aria-label="Close the tour (resume later from the menu)"
              className="flex size-11 items-center justify-center rounded-lg text-mist/80 hover:bg-white/10 hover:text-white">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <h2 id="tour-title" className="mt-1 text-lg font-semibold text-white">{step.title}</h2>
            <p id="tour-body" className="mt-1 text-sm leading-relaxed text-mist/90">{step.body}</p>
            {step.list ? (
              <ol className="mt-3 space-y-1.5 text-sm">
                {step.list.map((i) => (
                  <li key={i.when} className={cn("grid grid-cols-[6.5rem_1fr] gap-2", i.strong && "rounded-md bg-white/10 px-1.5 py-1 font-semibold text-white")}>
                    <span className="tabular text-lime">{i.when}</span><span>{i.what}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            {step.links ? (
              <ul className="mt-3 space-y-1.5">
                {step.links.map((l) => {
                  const href = typeof l.href === "function" ? l.href(ctx) : l.href;
                  return (
                    <li key={l.label}>
                      <Link href={href} onClick={() => close("completed")}
                        className="flex min-h-11 items-center justify-between gap-2 rounded-lg bg-white/10 px-3 text-sm font-medium text-white hover:bg-white/15">
                        {l.label}<ChevronRight className="size-4 shrink-0 text-lime" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
            {def.steps.map((s, i) => (
              <span key={s.id} className={cn("h-1.5 rounded-full transition-all", i === run.step ? "w-5 bg-lime" : i < run.step ? "w-1.5 bg-lime/70" : "w-1.5 bg-white/25")} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            {!last ? (
              <button type="button" onClick={() => close("skipped")} className="h-11 rounded-lg px-3 text-sm font-medium text-mist/80 hover:bg-white/10 hover:text-white">
                Skip tour
              </button>
            ) : null}
            <span className="flex-1" />
            {run.step > 0 ? (
              <button type="button" onClick={() => goTo(run.tourId, run.step - 1, -1)}
                className="inline-flex h-11 items-center gap-1 rounded-lg border border-white/25 px-3 text-sm font-semibold text-white hover:bg-white/10">
                <ChevronLeft className="size-4" aria-hidden />Back
              </button>
            ) : null}
            <button type="button" data-tour-primary
              onClick={() => (last ? close("completed") : goTo(run.tourId, run.step + 1, 1))}
              className="inline-flex h-11 items-center gap-1 rounded-lg bg-lime px-4 text-sm font-semibold text-forest hover:bg-lime/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
              {last ? "Done" : "Next"}{last ? null : <ChevronRight className="size-4" aria-hidden />}
            </button>
          </div>
        </div>
      ) : (
        <div role="status" className="fixed bottom-4 left-1/2 z-[71] -translate-x-1/2 rounded-full bg-forest px-4 py-2 text-sm text-mist shadow-lg">
          Loading the next step…
        </div>
      )}
    </div>
  );
}
