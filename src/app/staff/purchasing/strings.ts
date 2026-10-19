// User-facing strings for purchasing.
export const S = {
  title: "Purchasing",
  description: "Shopping list from locked orders minus stock on hand, the morning top-up list, purchases and prices.",
  tabs: { shopping: "Shopping list", topup: "Top-up list", log: "Log purchase", prices: "Price history" },
  shoppingEmpty: "No locked orders for this week yet",
  shoppingEmptyBody: "The shopping list is built from locked orders. Next week locks on Thursday at 18:00; the list is ready on Friday morning.",
  allCovered: "Stock on hand covers everything this week.",
  priceMissing: "price missing",
  missingAlert: "Some ingredients have no price, so the total is incomplete. Log a purchase to set the price.",
  topupEmpty: "No quick starts to top up for this day",
  topupEmptyBody: "Quick starts are locked at 18:00 the day before. Fresh items they need show here for the morning purchase.",
  logEmpty: "No purchases logged yet",
  logEmptyBody: "Log every purchase with its supplier and price (Saturday purchases, morning top-ups).",
  saved: "Purchase logged",
  pricesPick: "Pick an ingredient to see its price history.",
  pricesEmpty: "No price recorded yet",
  pricesEmptyBody: "The first purchase you log sets the price.",
} as const;
