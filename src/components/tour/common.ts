import type { TourContext, TourStep } from "./types";

/** First step of every tour. */
export function welcomeStep(role: string, intro: string): TourStep {
  return {
    id: "welcome",
    title: `Welcome to Quest Meals, ${role}`,
    body: `${intro} Use Next and Back to move, or Skip tour to stop. You can replay it any time from the menu.`,
  };
}

/** Second step of every tour: the fixed weekly rhythm (Addis times). */
export const weekStep: TourStep = {
  id: "how-a-week-works",
  title: "How a Quest week works",
  body: "The app runs on a weekly rhythm. These jobs happen on their own at the same times every week (Addis time).",
  list: [
    { when: "Tue 10:00", what: "Reminder to clients: changes and payment due Thursday" },
    { when: "Thu 16:00", what: "Last call for unpaid invoices" },
    { when: "Thu 18:00", what: "Cutoff: next week's orders lock and invoices go out", strong: true },
    { when: "Fri 08:00", what: "Shopping list for next week" },
    { when: "Sun 17:00", what: "Stock count reminder" },
    { when: "Every day 06:00", what: "Production sheet and rider routes for today" },
    { when: "Every day 18:00", what: "Quick starts lock for the next service day" },
  ],
};

/** Last step of every tour: what this role does each day/week, with links. */
export function yourWeekStep(items: { label: string; href: string | ((c: TourContext) => string) }[]): TourStep {
  return {
    id: "your-week",
    title: "Your week",
    body: "These are the things you do most. Replay this tour any time from the menu.",
    links: items,
  };
}
