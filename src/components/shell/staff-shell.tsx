import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/domain/types";
import { navFor, STAFF_NAV } from "./nav-config";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";
import { Logo } from "./logo";

/** Layout for every staff area: top bar on phones with a menu sheet, Deep Forest sidebar on laptops. */
export function StaffShell({ roles, name, unread, children }: { roles: Role[]; name: string; unread?: number; children: ReactNode }) {
  const items = navFor(STAFF_NAV, roles);
  const home = items.find((i) => !i.href.endsWith("/notifications"))?.href ?? "/staff";
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr] print:block">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href={home} aria-label="Quest Meals home" className="flex min-h-11 items-center"><Logo variant="horizontal" height={24} priority /></Link>
        <MobileNav items={items} name={name} unread={unread} />
      </header>
      <aside className="no-print sticky top-0 hidden h-dvh flex-col bg-sidebar text-sidebar-foreground md:flex">
        <Link href={home} aria-label="Quest Meals home" className="flex min-h-11 items-center px-5 pt-5 pb-4"><Logo variant="horizontal-reversed" height={26} priority /></Link>
        <div className="relative min-h-0 flex-1">
          <div className="h-full overflow-y-auto px-3 pb-6">
            <NavLinks items={items} unread={unread} tone="dark" />
          </div>
          {/* Hints that the list scrolls when it is taller than the window */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent" />
        </div>
        <div className="space-y-2 border-t border-sidebar-border p-4 text-sm">
          <p className="truncate font-medium">{name}</p>
          <SignOutButton className="border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
