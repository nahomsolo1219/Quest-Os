"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Horizontal section tabs (links). Scrolls sideways on phones instead of wrapping the page. */
export function TabNav({ items, label }: { items: { href: string; label: string; exact?: boolean }[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="no-print -mx-4 mb-4 overflow-x-auto px-4">
      <ul className="flex w-max gap-1 border-b">
        {items.map((i) => {
          const active = i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`);
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={active ? "page" : undefined}
                className={cn("inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium",
                  active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
