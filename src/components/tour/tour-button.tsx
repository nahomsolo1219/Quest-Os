"use client";

import { Compass } from "lucide-react";
import type { TourId } from "@/lib/tours";
import { startTour } from "./events";

/** Staff (e.g. coaches) using the client app: one button to take their tour. */
export function TourButton({ tours }: { tours: TourId[] }) {
  if (tours.length === 0) return null;
  return (
    <button type="button" onClick={() => startTour(tours[tours.length - 1] === "coach" ? "coach" : tours[0], 0)}
      data-tour="menu-tours" aria-label="Take the tour"
      className="flex size-11 items-center justify-center rounded-lg hover:bg-accent">
      <Compass className="size-5" aria-hidden />
    </button>
  );
}
