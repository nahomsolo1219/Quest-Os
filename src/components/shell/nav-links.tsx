"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Bike, Boxes, CalendarCheck, ChefHat, ClipboardList, Handshake, LayoutDashboard, ListChecks, MessagesSquare,
  NotebookText, PackageCheck, Salad, Settings, ShoppingBasket, Trash2, TrendingUp, Truck, Users, Wallet, Zap, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { navSections, type NavIcon, type NavItem } from "./nav-config";

export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  dashboard: LayoutDashboard, today: CalendarCheck, bell: Bell, clients: Users, payments: Wallet, quickstart: Zap,
  orders: ClipboardList, purchasing: ShoppingBasket, kitchen: ChefHat, stock: Boxes, waste: Trash2, delivery: Truck,
  pickup: PackageCheck, drops: Bike, community: MessagesSquare, nutrition: Salad, partners: Handshake, settings: Settings,
  menu: NotebookText, progress: TrendingUp, plan: ListChecks,
};

export function isActive(pathname: string, href: string) {
  return href === "/staff" || href === "/kitchen" || href === "/app" || href === "/delivery" ? pathname === href : pathname.startsWith(href);
}

/** Grouped navigation. `dark` is the Deep Forest sidebar; `light` is the phone menu sheet. */
export function NavLinks({ items, unread, onNavigate, tone = "light" }: {
  items: NavItem[]; unread?: number; onNavigate?: () => void; tone?: "light" | "dark";
}) {
  const pathname = usePathname();
  const dark = tone === "dark";
  return (
    <nav aria-label="Main" className="flex flex-col gap-3">
      {navSections(items).map((g) => (
        <div key={g.section ?? "main"} className="flex flex-col gap-0.5">
          {g.section ? (
            <p className={cn("px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wider", dark ? "text-sidebar-muted" : "text-muted-foreground")}>
              {g.section}
            </p>
          ) : null}
          {g.items.map((i) => {
            const Icon = i.icon ? NAV_ICONS[i.icon] : null;
            const on = isActive(pathname, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={onNavigate}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
                  dark
                    ? on ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/90 hover:bg-sidebar-accent/60"
                    : on ? "bg-accent text-accent-foreground" : "hover:bg-accent",
                )}
              >
                {on ? <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-full", dark ? "bg-lime" : "bg-primary")} /> : null}
                {Icon ? <Icon aria-hidden className={cn("size-4 shrink-0", dark ? (on ? "text-lime" : "text-sidebar-muted") : "text-sage-ink")} /> : null}
                <span className="flex-1">{i.label}</span>
                {i.href.endsWith("/notifications") && unread ? (
                  <span className={cn("rounded-full px-2 text-xs font-semibold tabular", dark ? "bg-lime text-forest" : "bg-primary text-primary-foreground")}>
                    {unread}<span className="sr-only"> unread</span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
