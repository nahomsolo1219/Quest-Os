"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog. Hidden when printing. */
export function PrintButton({ label = "Print", tour }: { label?: string; tour?: string }) {
  return (
    <Button type="button" data-tour={tour} className="no-print h-11" onClick={() => window.print()}>
      <Printer aria-hidden /> {label}
    </Button>
  );
}
