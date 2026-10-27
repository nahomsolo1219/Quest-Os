"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * The one tab style for staff pages (UI refresh item 11): underline tabs, Deep Forest text and a lime underline on
 * the active tab. The bar scrolls sideways inside itself on phones (never the page) and shows a fade on the edge
 * that has more tabs. Two flavours share the look:
 * - `UnderlineTabNav`: link tabs (sub-pages or ?tab= query tabs).
 * - `UnderlineTabsList` + `UnderlineTabsTrigger`: styled shadcn/Radix Tabs for in-page panels.
 */

const TAB_CLASS =
  "relative inline-flex min-h-11 shrink-0 items-center whitespace-nowrap px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-full after:bg-transparent";
const ACTIVE_CLASS = "text-primary font-semibold after:bg-lime";

/** Scroll container with edge fades that only show while there is more to scroll in that direction. */
function FadeScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    // keep the active tab in view on first render (e.g. "Changes" on a phone)
    const active = el.querySelector<HTMLElement>("[aria-current=page], [data-state=active]");
    if (active && active.offsetLeft + active.offsetWidth > el.clientWidth) el.scrollLeft = active.offsetLeft - 24;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  return (
    <div className={cn("no-print relative border-b", className)}>
      <div ref={ref} onScroll={update} className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-background to-transparent transition-opacity", edges.left ? "opacity-100" : "opacity-0")} />
      <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")} />
    </div>
  );
}

export type UnderlineTabItem = { href: string; label: ReactNode; key?: string; exact?: boolean; active?: boolean };

/** Link tabs. Active = `item.active` when given (query-string tabs), otherwise matched against the path. */
export function UnderlineTabNav({ items, label, className }: { items: UnderlineTabItem[]; label: string; className?: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className={cn("mb-4", className)}>
      <FadeScroller>
        <ul className="flex w-max min-w-full">
          {items.map((i) => {
            const active = i.active ?? (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`));
            return (
              <li key={i.key ?? i.href}>
                <Link href={i.href} aria-current={active ? "page" : undefined} className={cn(TAB_CLASS, active && ACTIVE_CLASS)}>
                  {i.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </FadeScroller>
    </nav>
  );
}

/** shadcn TabsList in the underline style. Put `UnderlineTabsTrigger`s inside. */
export function UnderlineTabsList({ className, children, ...props }: ComponentProps<typeof TabsList>) {
  return (
    <FadeScroller className="w-full">
      <TabsList variant="line" className={cn("h-auto group-data-[orientation=horizontal]/tabs:h-auto w-max min-w-full justify-start gap-0 rounded-none bg-transparent p-0", className)} {...props}>
        {children}
      </TabsList>
    </FadeScroller>
  );
}

export function UnderlineTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        TAB_CLASS,
        "h-auto flex-none rounded-none border-0 py-0 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:after:bg-lime",
        // the shadcn line variant draws its own underline 5 px below; ours replaces it
        "group-data-[orientation=horizontal]/tabs:after:bottom-0 group-data-[orientation=horizontal]/tabs:after:inset-x-2 group-data-[orientation=horizontal]/tabs:after:h-[3px] after:opacity-100 group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}
