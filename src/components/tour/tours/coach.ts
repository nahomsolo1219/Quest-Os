import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the role builder writes the real steps (data-tour targets on the pages).
export const coachTour: TourDef = {
  id: "coach",
  steps: [
    welcomeStep("coach", "Coaches keep the community going: posts, challenges and moderation."),
    weekStep,
    yourWeekStep([
      { label: "Every day: the community feed", href: "/staff/community" },
    ]),
  ],
};
