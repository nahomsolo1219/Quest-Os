import type { TourId, TourProgressMap } from "@/lib/tours";
import type { TourContext } from "./types";

/** What a shell needs to run tours: the person's tours (in auto-start order), saved progress, today. */
export type TourBoot = { tours: TourId[]; progress: TourProgressMap; ctx: TourContext };
