import type { TourId } from "@/lib/tours";

/** sessionStorage: the tour running in this tab (survives page changes across the staff areas). */
export const RUN_KEY = "qm-tour-run";
/** sessionStorage: the user closed the tour in this tab, so it does not auto-start again until a new session. */
export const PAUSED_KEY = "qm-tour-paused";

/** window event: start a tour ("Take the tour" in the menu). */
export const TOUR_START_EVENT = "qm:tour-start";
export type TourStartDetail = { tourId: TourId; step?: number };

/** window event: open/close the phone menu sheet for a step that points into it. */
export const TOUR_NAV_EVENT = "qm:tour-nav";
/** window event: the running tour changed (detail: run or null), for the menu's "3 of 9" chip. */
export const TOUR_STATE_EVENT = "qm:tour-state";

export function startTour(tourId: TourId, step = 0) {
  window.dispatchEvent(new CustomEvent<TourStartDetail>(TOUR_START_EVENT, { detail: { tourId, step } }));
}
