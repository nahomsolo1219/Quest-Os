// Drizzle relations for the relational query API (db.query.*).
import { relations } from "drizzle-orm";
import { account, session, user } from "./auth";
import { accountCredits, invoices, packages, pauses, payments, subscriptions } from "./billing";
import { challengeCheckins, challenges, communityComments, communityPosts, communityReactions, mealRatings } from "./community";
import { areas, clients, consultations, nutritionProfiles } from "./core";
import { deliveryDrops } from "./delivery";
import { purchases, stockCounts, wasteLog } from "./kitchen";
import { clientAddons, clientSwaps, ingredientPrices, ingredients, meals, partIngredients, parts, profilePortions, swapRules } from "./menu";
import { orderDays, orderMeals, weeklyOrders } from "./orders";
import { checkins, notifications, telegramLinks } from "./ops";

export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  client: one(clients, { fields: [user.id], references: [clients.userId] }),
  notifications: many(notifications),
  telegramLink: one(telegramLinks, { fields: [user.id], references: [telegramLinks.userId] }),
}));
export const sessionRelations = relations(session, ({ one }) => ({ user: one(user, { fields: [session.userId], references: [user.id] }) }));
export const accountRelations = relations(account, ({ one }) => ({ user: one(user, { fields: [account.userId], references: [user.id] }) }));

export const areaRelations = relations(areas, ({ many }) => ({ clients: many(clients) }));
export const clientRelations = relations(clients, ({ one, many }) => ({
  user: one(user, { fields: [clients.userId], references: [user.id] }),
  area: one(areas, { fields: [clients.areaId], references: [areas.id] }),
  consultations: many(consultations),
  nutritionProfiles: many(nutritionProfiles),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
  payments: many(payments),
  credits: many(accountCredits),
  swaps: many(clientSwaps),
  addons: many(clientAddons),
  weeklyOrders: many(weeklyOrders),
  checkins: many(checkins),
  drops: many(deliveryDrops),
  mealRatings: many(mealRatings),
}));
export const consultationRelations = relations(consultations, ({ one }) => ({
  client: one(clients, { fields: [consultations.clientId], references: [clients.id] }),
}));
export const nutritionProfileRelations = relations(nutritionProfiles, ({ one }) => ({
  client: one(clients, { fields: [nutritionProfiles.clientId], references: [clients.id] }),
}));

export const ingredientRelations = relations(ingredients, ({ one, many }) => ({
  stockIngredient: one(ingredients, { fields: [ingredients.stockIngredientId], references: [ingredients.id], relationName: "stock" }),
  prices: many(ingredientPrices),
  partIngredients: many(partIngredients),
  purchases: many(purchases),
  stockCounts: many(stockCounts),
  waste: many(wasteLog),
}));
export const ingredientPriceRelations = relations(ingredientPrices, ({ one }) => ({
  ingredient: one(ingredients, { fields: [ingredientPrices.ingredientId], references: [ingredients.id] }),
}));
export const mealRelations = relations(meals, ({ many }) => ({ parts: many(parts) }));
export const partRelations = relations(parts, ({ one, many }) => ({
  meal: one(meals, { fields: [parts.mealId], references: [meals.id] }),
  ingredients: many(partIngredients),
  portions: many(profilePortions),
}));
export const partIngredientRelations = relations(partIngredients, ({ one }) => ({
  part: one(parts, { fields: [partIngredients.partId], references: [parts.id] }),
  ingredient: one(ingredients, { fields: [partIngredients.ingredientId], references: [ingredients.id] }),
}));
export const profilePortionRelations = relations(profilePortions, ({ one }) => ({
  part: one(parts, { fields: [profilePortions.partId], references: [parts.id] }),
}));
export const swapRuleRelations = relations(swapRules, ({ one }) => ({
  toIngredient: one(ingredients, { fields: [swapRules.toIngredientId], references: [ingredients.id] }),
  toMeal: one(meals, { fields: [swapRules.toMealId], references: [meals.id] }),
}));
export const clientSwapRelations = relations(clientSwaps, ({ one }) => ({
  client: one(clients, { fields: [clientSwaps.clientId], references: [clients.id] }),
  rule: one(swapRules, { fields: [clientSwaps.swapRuleId], references: [swapRules.id] }),
}));
export const clientAddonRelations = relations(clientAddons, ({ one }) => ({
  client: one(clients, { fields: [clientAddons.clientId], references: [clients.id] }),
}));

export const packageRelations = relations(packages, ({ many }) => ({ subscriptions: many(subscriptions) }));
export const subscriptionRelations = relations(subscriptions, ({ one, many }) => ({
  client: one(clients, { fields: [subscriptions.clientId], references: [clients.id] }),
  package: one(packages, { fields: [subscriptions.packageId], references: [packages.id] }),
  pauses: many(pauses),
  invoices: many(invoices),
}));
export const pauseRelations = relations(pauses, ({ one }) => ({
  subscription: one(subscriptions, { fields: [pauses.subscriptionId], references: [subscriptions.id] }),
}));
export const invoiceRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, { fields: [invoices.clientId], references: [clients.id] }),
  subscription: one(subscriptions, { fields: [invoices.subscriptionId], references: [subscriptions.id] }),
  payments: many(payments),
}));
export const paymentRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, { fields: [payments.invoiceId], references: [invoices.id] }),
  client: one(clients, { fields: [payments.clientId], references: [clients.id] }),
}));
export const accountCreditRelations = relations(accountCredits, ({ one }) => ({
  client: one(clients, { fields: [accountCredits.clientId], references: [clients.id] }),
}));

export const weeklyOrderRelations = relations(weeklyOrders, ({ one, many }) => ({
  client: one(clients, { fields: [weeklyOrders.clientId], references: [clients.id] }),
  subscription: one(subscriptions, { fields: [weeklyOrders.subscriptionId], references: [subscriptions.id] }),
  days: many(orderDays),
}));
export const orderDayRelations = relations(orderDays, ({ one, many }) => ({
  weeklyOrder: one(weeklyOrders, { fields: [orderDays.weeklyOrderId], references: [weeklyOrders.id] }),
  client: one(clients, { fields: [orderDays.clientId], references: [clients.id] }),
  meals: many(orderMeals),
}));
export const orderMealRelations = relations(orderMeals, ({ one }) => ({
  day: one(orderDays, { fields: [orderMeals.orderDayId], references: [orderDays.id] }),
  meal: one(meals, { fields: [orderMeals.mealId], references: [meals.id] }),
  client: one(clients, { fields: [orderMeals.clientId], references: [clients.id] }),
}));

export const deliveryDropRelations = relations(deliveryDrops, ({ one }) => ({
  client: one(clients, { fields: [deliveryDrops.clientId], references: [clients.id] }),
  area: one(areas, { fields: [deliveryDrops.areaId], references: [areas.id] }),
  rider: one(user, { fields: [deliveryDrops.riderUserId], references: [user.id] }),
}));
export const checkinRelations = relations(checkins, ({ one }) => ({
  client: one(clients, { fields: [checkins.clientId], references: [clients.id] }),
}));
export const purchaseRelations = relations(purchases, ({ one }) => ({
  ingredient: one(ingredients, { fields: [purchases.ingredientId], references: [ingredients.id] }),
}));
export const stockCountRelations = relations(stockCounts, ({ one }) => ({
  ingredient: one(ingredients, { fields: [stockCounts.ingredientId], references: [ingredients.id] }),
}));
export const wasteRelations = relations(wasteLog, ({ one }) => ({
  ingredient: one(ingredients, { fields: [wasteLog.ingredientId], references: [ingredients.id] }),
}));
export const notificationRelations = relations(notifications, ({ one }) => ({
  user: one(user, { fields: [notifications.userId], references: [user.id] }),
}));

export const postRelations = relations(communityPosts, ({ one, many }) => ({
  author: one(user, { fields: [communityPosts.authorUserId], references: [user.id] }),
  challenge: one(challenges, { fields: [communityPosts.challengeId], references: [challenges.id] }),
  comments: many(communityComments),
  reactions: many(communityReactions),
}));
export const commentRelations = relations(communityComments, ({ one }) => ({
  post: one(communityPosts, { fields: [communityComments.postId], references: [communityPosts.id] }),
  author: one(user, { fields: [communityComments.authorUserId], references: [user.id] }),
}));
export const reactionRelations = relations(communityReactions, ({ one }) => ({
  post: one(communityPosts, { fields: [communityReactions.postId], references: [communityPosts.id] }),
}));
export const challengeRelations = relations(challenges, ({ many }) => ({ checkins: many(challengeCheckins) }));
export const challengeCheckinRelations = relations(challengeCheckins, ({ one }) => ({
  challenge: one(challenges, { fields: [challengeCheckins.challengeId], references: [challenges.id] }),
}));
export const mealRatingRelations = relations(mealRatings, ({ one }) => ({
  meal: one(meals, { fields: [mealRatings.mealId], references: [meals.id] }),
  client: one(clients, { fields: [mealRatings.clientId], references: [clients.id] }),
}));
