"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";
import { isActive, NAV_ICONS } from "./nav-links";

export function BottomTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="App" className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((i) => {
          const active = isActive(pathname, i.href);
          const Icon = i.icon ? NAV_ICONS[i.icon] : null;
          return (
            <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined}
              className={cn("relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
              {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-lime" /> : null}
              {Icon ? <Icon aria-hidden className={cn("size-5", active && "text-primary")} strokeWidth={active ? 2.4 : 2} /> : null}
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
