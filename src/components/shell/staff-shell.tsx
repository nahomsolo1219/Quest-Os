import Link from "next/link";
import type { ReactNode } from "react";
import type { Role } from "@/domain/types";
import { navFor, STAFF_NAV } from "./nav-config";
import { NavLinks } from "./nav-links";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";

/** Layout for every staff area: top bar on phones with a menu sheet, sidebar on laptops. */
export function StaffShell({ roles, name, unread, children }: { roles: Role[]; name: string; unread?: number; children: ReactNode }) {
  const items = navFor(STAFF_NAV, roles);
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/staff" className="text-lg font-extrabold text-primary">Quest Meals</Link>
        <MobileNav items={items} name={name} unread={unread} />
      </header>
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r bg-muted/40 p-4 md:flex">
        <Link href="/staff" className="mb-6 text-xl font-extrabold text-primary">Quest Meals</Link>
        <NavLinks items={items} unread={unread} />
        <div className="mt-auto space-y-2 border-t pt-4 text-sm">
          <p className="truncate font-medium">{name}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 p-4 md:p-6">{children}</main>
    </div>
  );
}
