import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Kitchen tour. The sheet steps follow the links of the first cook day with meals on /kitchen (today when it has
// any), and the same "sheet-tab-*" names sit on the tabs of every sheet, so the tour stays on that day (D640).
export const kitchenTour: TourDef = {
  id: "kitchen",
  steps: [
    welcomeStep("kitchen team", "This tour shows how to cook, pack, label and count stock with the app."),
    weekStep,
    {
      id: "cook-days",
      path: "/kitchen",
      target: "kitchen-day-first",
      title: "Cook days",
      body: "Each card is a day to cook: how many meals and for how many clients. Meals show here after the Thursday 18:00 lock. The four buttons open that day's sheets.",
    },
    {
      id: "production",
      path: { hrefOf: "sheet-tab-production" },
      target: "production-first-meal",
      title: "Production sheet: what to cook",
      body: "Every part of every meal, with the total to cook and the amount for each profile. Tick Done as each part is ready (the tick stays on this device only). Print puts the full table on paper.",
    },
    {
      id: "ingredients",
      target: "production-ingredients",
      title: "Ingredient totals",
      body: "Everything the day needs, as weighed and in purchase units. Use it to take food out of the store before you start cooking.",
    },
    {
      id: "recipes",
      path: { hrefOf: "sheet-tab-recipes" },
      target: "recipes-first-card",
      title: "Recipe cards",
      body: "One card per meal: how many portions of each profile, then each part with its ingredients and the amount per profile. Use them when you are not sure how a meal is made.",
    },
    {
      id: "packing",
      path: { hrefOf: "sheet-tab-packing" },
      target: "packing-first-client",
      title: "Packing list",
      body: "One box per client with each meal and what goes in it. A red border means an allergy or dislike: check it before you pack. Tick Packed for each meal.",
    },
    {
      id: "labels",
      path: { hrefOf: "sheet-tab-labels" },
      target: "labels-print",
      title: "Labels",
      body: "One label per meal: client, profile, calories and the eat-by date. Tap Print labels, print on A4 at 100% scale and stick one on each box.",
    },
    {
      id: "stock",
      path: "/kitchen/stock",
      target: "stock-first-line",
      title: "Stock count",
      body: "Count what is on the shelves. Type the amount and Save, or tap Matches when it equals what the app expects. A reminder comes every Sunday at 17:00.",
    },
    {
      id: "waste",
      path: "/kitchen/waste",
      target: "waste-form",
      title: "Waste log",
      body: "When food is thrown away (spoiled, burnt, dropped), log the ingredient, the amount and why. Waste comes off the stock on hand.",
    },
    yourWeekStep([
      { label: "Every morning: open today's production sheet", href: (c) => `/kitchen/production/${c.today}` },
      { label: "Then pack with the packing list", href: (c) => `/kitchen/packing/${c.today}` },
      { label: "Print labels and stick one on each box", href: (c) => `/kitchen/labels/${c.today}` },
      { label: "When food is thrown away: Waste log", href: "/kitchen/waste" },
      { label: "Sunday evening: Stock count", href: "/kitchen/stock" },
    ]),
  ],
};
