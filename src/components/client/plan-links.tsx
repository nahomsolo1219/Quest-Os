import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** One row in the Plan tab's "Manage" list: icon, title, a short line, optional badge or deadline. */
export function PlanLinkRow({ href, icon, title, children, aside }: {
  href: string; icon: ReactNode; title: string; children?: ReactNode; aside?: ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-accent focus-visible:bg-accent">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold">{title}</span>
            {aside}
          </div>
          {children ? <div className="mt-0.5 text-sm text-muted-foreground">{children}</div> : null}
        </div>
        <ChevronRight aria-hidden className="size-5 shrink-0 text-sage" />
      </Link>
    </li>
  );
}

/** "‹ Plan" link at the top of the sub-pages reached from the Plan tab (swaps, pause, payments, profile). */
export function BackToPlan() {
  return (
    <Link href="/app/plan" className="-ml-2 mb-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-accent">
      <ChevronLeft aria-hidden className="size-4" />
      Back to Plan
    </Link>
  );
}
