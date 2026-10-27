import type { TourId } from "@/lib/tours";
import type { TourDef } from "../types";
import { coachTour } from "./coach";
import { deliveryTour } from "./delivery";
import { kitchenTour } from "./kitchen";
import { nutritionistTour } from "./nutritionist";
import { operationsTour } from "./operations";
import { ownerTour } from "./owner";

export const TOURS: Record<TourId, TourDef> = {
  owner: ownerTour,
  operations: operationsTour,
  nutritionist: nutritionistTour,
  kitchen: kitchenTour,
  delivery: deliveryTour,
  coach: coachTour,
};
