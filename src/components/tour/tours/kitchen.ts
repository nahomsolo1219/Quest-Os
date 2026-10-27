import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the kitchen builder writes the real steps (data-tour targets on the kitchen pages).
export const kitchenTour: TourDef = {
  id: "kitchen",
  steps: [
    welcomeStep("kitchen team", "This tour shows how to cook, pack and count stock with the app."),
    weekStep,
    yourWeekStep([
      { label: "Every morning: open today's production sheet", href: (c) => `/kitchen/production/${c.today}` },
      { label: "Then pack with the packing list", href: (c) => `/kitchen/packing/${c.today}` },
    ]),
  ],
};
