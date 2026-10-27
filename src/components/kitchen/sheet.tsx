import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * White, high-contrast kitchen sheet (production, recipes, packing). On screen: 18 px Charcoal text on white with
 * roomy rows. In print every size falls back to the A4 print styles (11 pt body, black text, no padding),
 * so printed sheets are unchanged.
 */
export function KitchenSheet({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "kitchen-sheet rounded-xl bg-white p-3 text-lg text-charcoal ring-1 ring-border sm:p-5",
      "print:rounded-none print:p-0 print:text-[11pt] print:text-black print:ring-0",
      className,
    )}>
      {children}
    </div>
  );
}

/** Screen-only card list, shown below `md` instead of a wide table (the table still prints). */
export function PhoneCards({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <ul aria-label={label} className={cn("space-y-3 md:hidden print:hidden", className)}>{children}</ul>;
}

/** Wrapper for a table shown from `md` up and always in print; scrolls sideways inside itself only. */
export function WideTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("hidden overflow-x-auto rounded-xl border md:block print:block", className)}>
      {children}
    </div>
  );
}

/** "More" disclosure inside a phone card. */
export function More({ children, summary = "More" }: { children: ReactNode; summary?: string }) {
  return (
    <details className="group mt-2 border-t pt-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-base font-semibold text-primary [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-block transition-transform group-open:rotate-90">›</span> {summary}
      </summary>
      <div className="pb-1 text-base">{children}</div>
    </details>
  );
}
