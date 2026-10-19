import type { DropStatus } from "@/domain/types";

/** Plain drop data passed to the delivery client components. */
export type DropCardData = {
  id: string;
  name: string;
  areaName: string | null;
  address: string | null;
  phone: string | null;
  mealsCount: number;
  slot: string | null;
  riderUserId: string | null;
  riderName: string | null;
  status: DropStatus;
  failedReason: string | null;
};

export const SLOT_TEXT: Record<string, string> = { breakfast: "Breakfast drop", lunch: "Lunch drop", dinner_snack: "Dinner and snack drop" };

/** Maps a service drop to the client card data (full name for riders and the counter). */
export function toCard(d: {
  id: string; firstName: string; lastName: string; areaName: string | null; address: string | null; phone: string | null; mealsCount: number;
  slot: string | null; riderUserId: string | null; riderName: string | null; status: DropStatus; failedReason: string | null;
}): DropCardData {
  return {
    id: d.id, name: `${d.firstName} ${d.lastName}`, areaName: d.areaName, address: d.address, phone: d.phone, mealsCount: d.mealsCount,
    slot: d.slot, riderUserId: d.riderUserId, riderName: d.riderName, status: d.status, failedReason: d.failedReason,
  };
}
