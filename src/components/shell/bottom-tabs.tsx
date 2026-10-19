"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";

export function BottomTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur">
      <div className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((i) => {
          const active = i.href === "/app" ? pathname === "/app" : pathname.startsWith(i.href);
          return (
            <Link key={i.href} href={i.href}
              className={cn("flex min-h-14 items-center justify-center text-xs font-semibold", active ? "text-primary" : "text-muted-foreground")}>
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
