"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "./nav-config";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";

export function MobileNav({ items, name, unread }: { items: NavItem[]; name: string; unread?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-11" aria-label="Open menu">
          <Menu className="size-6" />
          {unread ? (
            <span aria-hidden className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unread}</span>
          ) : null}
          {unread ? <span className="sr-only">{unread} unread notifications</span> : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 overflow-y-auto p-4">
        <SheetHeader className="p-0">
          <SheetTitle>{name}</SheetTitle>
        </SheetHeader>
        <NavLinks items={items} unread={unread} onNavigate={() => setOpen(false)} />
        <div className="mt-4 border-t pt-4"><SignOutButton /></div>
      </SheetContent>
    </Sheet>
  );
}
