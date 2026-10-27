import type { DateStr } from "@/domain/types";
import type { TourId } from "@/lib/tours";

/** Values the server gives the tour for "today" (Addis), so steps can open today's sheets. */
export type TourContext = { today: DateStr; tomorrow: DateStr };

/**
 * Where a step happens. A string or a function of today's date; `{ hrefOf }` follows the link of a
 * target on the page the tour is on (e.g. "open the first client").
 */
export type StepPath = string | ((c: TourContext) => string) | { hrefOf: string };

export type TourStep = {
  /** unique within the tour */
  id: string;
  /** page the step is on; the tour navigates there first. Omit to stay on the current page. */
  path?: StepPath;
  /** value of a data-tour="…" attribute on the page; omit for a centred card */
  target?: string;
  title: string;
  /** 1–3 plain sentences */
  body: string;
  /** on phones, open the menu sheet first (the target is a menu item) */
  action?: "open-nav";
  /** links shown on the card (used by the last "Your week" step) */
  links?: { label: string; href: string | ((c: TourContext) => string) }[];
  /** a list shown on the card (e.g. the weekly timeline) */
  list?: { when: string; what: string; strong?: boolean }[];
};

export type TourDef = { id: TourId; steps: TourStep[] };
