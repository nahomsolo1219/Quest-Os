import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Rider tour. It only points at Delivered / Failed / Hand over and explains them: nothing is clicked, no data changes (D641).
export const deliveryTour: TourDef = {
  id: "delivery",
  steps: [
    welcomeStep("rider", "This tour shows your route, how to mark drops and how to hand over pick-ups."),
    weekStep,
    {
      id: "my-drops",
      path: "/delivery",
      target: "drops-list",
      title: "My drops",
      body: "Today's drops in route order: start at 1 and work down. The line at the top counts delivered, failed and still to go. The route is ready at 06:00.",
    },
    {
      id: "drop",
      target: "drop-first",
      title: "One drop",
      body: "Each card shows the client, the area, how many meals and the address. Tap Call to phone the client if you cannot find them.",
    },
    {
      id: "delivered",
      target: "drop-delivered",
      title: "Delivered",
      body: "Tap Delivered when the client has the meals. It saves at once and has no Undo, so tap it only after the hand-over.",
    },
    {
      id: "failed",
      target: "drop-failed",
      title: "Failed, with a reason",
      body: "Could not deliver? Tap Failed…, pick why (Not home, Wrong address, Refused or Other) and tap Save as failed. Operations see it straight away. Tapped by mistake? Tap Undo on the message that appears.",
    },
    {
      id: "pickup-list",
      path: "/delivery/pickup",
      target: "pickup-list",
      title: "Pick-up list",
      body: "Clients who collect their meals at Adorsi Cafe today. Open it from Pick-up list in the menu or at the top of My drops.",
    },
    {
      id: "hand-over",
      target: "pickup-hand-over",
      title: "Hand over",
      body: "Tap Hand over when the client takes their meals. If you tapped the wrong name, tap Undo on the message that appears.",
    },
    yourWeekStep([
      { label: "Every morning: open My drops", href: "/delivery" },
      { label: "Mark each drop Delivered or Failed", href: "/delivery" },
      { label: "At the cafe: Pick-up list", href: "/delivery/pickup" },
      { label: "06:00: a notification tells you your drops are ready", href: "/staff/notifications" },
    ]),
  ],
};
