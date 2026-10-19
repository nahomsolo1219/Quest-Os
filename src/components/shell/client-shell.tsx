import Link from "next/link";
import type { ReactNode } from "react";
import { Bell } from "lucide-react";
import { CLIENT_NAV } from "./nav-config";
import { BottomTabs } from "./bottom-tabs";

/** Client app layout: slim top bar and a bottom tab bar sized for thumbs. */
export function ClientShell({ unread, children }: { unread?: number; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-20">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
        <Link href="/app" className="flex min-h-11 items-center text-lg font-extrabold text-primary">Quest Meals</Link>
        <div className="flex items-center gap-1">
          <Link href="/app/notifications" aria-label="Notifications" className="relative flex size-11 items-center justify-center rounded-lg hover:bg-accent">
            <Bell className="size-5" />
            {unread ? <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{unread}</span> : null}
          </Link>
          <Link href="/app/profile" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium hover:bg-accent">Profile</Link>
        </div>
      </header>
      <main className="p-4">{children}</main>
      <BottomTabs items={CLIENT_NAV} />
    </div>
  );
}
