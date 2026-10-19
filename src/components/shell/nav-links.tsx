"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";

export function NavLinks({ items, unread, onNavigate }: { items: NavItem[]; unread?: number; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/staff" || href === "/kitchen" || href === "/app" ? pathname === href : pathname.startsWith(href);
  return (
    <nav className="flex flex-col gap-1">
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          onClick={onNavigate}
          className={cn(
            "flex min-h-11 items-center justify-between rounded-lg px-3 text-sm font-medium hover:bg-accent",
            active(i.href) && "bg-accent text-accent-foreground",
          )}
        >
          {i.label}
          {i.href.endsWith("/notifications") && unread ? (
            <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{unread}</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
