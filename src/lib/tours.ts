// Which guided tours exist and who takes them (staff-tour milestone). Steps live in src/components/tour/tours/.
import type { Role } from "@/domain/types";

export const TOUR_IDS = ["owner", "operations", "nutritionist", "kitchen", "delivery", "coach"] as const;
export type TourId = (typeof TOUR_IDS)[number];
export type TourStatus = "started" | "completed" | "skipped";
export type TourProgressMap = Partial<Record<TourId, { step: number; status: TourStatus }>>;

/** In this order: someone with several roles gets the first matching tour automatically (owner before coach). */
export const TOUR_META: { id: TourId; label: string; role: Role }[] = [
  { id: "owner", label: "Owner tour", role: "owner" },
  { id: "operations", label: "Operations tour", role: "operations" },
  { id: "nutritionist", label: "Nutritionist tour", role: "nutritionist" },
  { id: "kitchen", label: "Kitchen tour", role: "kitchen" },
  { id: "delivery", label: "Rider tour", role: "delivery" },
  { id: "coach", label: "Coach tour", role: "coach" },
];

export function toursFor(roles: readonly Role[]): TourId[] {
  return TOUR_META.filter((t) => roles.includes(t.role)).map((t) => t.id);
}

export function isTourId(v: string): v is TourId {
  return (TOUR_IDS as readonly string[]).includes(v);
}
