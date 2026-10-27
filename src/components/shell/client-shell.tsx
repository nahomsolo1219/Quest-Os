import Link from "next/link";
import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { CLIENT_NAV } from "./nav-config";
import { BottomTabs } from "./bottom-tabs";
import { Logo } from "./logo";

/** Client app layout: slim top bar and a bottom tab bar sized for thumbs. */
export function ClientShell({ unread, children }: { unread?: number; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <Link href="/app" aria-label="Quest Meals home" className="flex min-h-11 items-center"><Logo variant="horizontal" height={24} priority /></Link>
        <div className="flex items-center gap-1">
          <Link href="/app/notifications" aria-label="Notifications" className="relative flex size-11 items-center justify-center rounded-lg hover:bg-accent">
            <Bell className="size-5" />
            {unread ? <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unread}<span className="sr-only"> unread</span></span> : null}
          </Link>
          <Link href="/app/profile" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-accent">Profile</Link>
        </div>
      </header>
      <main className="p-4">{children}</main>
      <BottomTabs items={CLIENT_NAV} />
    </div>
  );
}
