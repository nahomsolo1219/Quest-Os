import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the role builder writes the real steps (data-tour targets on the pages).
export const ownerTour: TourDef = {
  id: "owner",
  steps: [
    welcomeStep("owner", "Dagi, Kidus and Fahim run the business here: money, clients, prices and the team."),
    weekStep,
    yourWeekStep([
      { label: "Every morning: check the Dashboard", href: "/staff/dashboard" },
      { label: "Work through the Today to-do list", href: "/staff" },
    ]),
  ],
};
