"use client";

import { useEffect, useRef, useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavItem } from "./nav-config";
import { NavLinks } from "./nav-links";
import { SignOutButton } from "./sign-out-button";
import type { TourBoot } from "@/components/tour/boot";
import { TourMenu } from "@/components/tour/tour-menu";
import { TOUR_NAV_EVENT } from "@/components/tour/events";

export function MobileNav({ items, name, unread, tour }: { items: NavItem[]; name: string; unread?: number; tour?: TourBoot | null }) {
  const [open, setOpen] = useState(false);
  // A tour step can open the sheet to point at a menu item; then the sheet is not modal so the tour card stays usable.
  const [tourDriven, setTourDriven] = useState(false);
  const drivenRef = useRef(false);
  useEffect(() => {
    const on = (e: Event) => {
      const want = !!(e as CustomEvent<{ open: boolean }>).detail?.open;
      if (want) { drivenRef.current = true; setTourDriven(true); setOpen(true); }
      else if (drivenRef.current) { drivenRef.current = false; setTourDriven(false); setOpen(false); }
    };
    window.addEventListener(TOUR_NAV_EVENT, on);
    return () => window.removeEventListener(TOUR_NAV_EVENT, on);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen} modal={!tourDriven}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative size-11" aria-label="Open menu">
          <Menu className="size-6" />
          {unread ? (
            <span aria-hidden className="absolute right-1 top-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unread}</span>
          ) : null}
          {unread ? <span className="sr-only">{unread} unread notifications</span> : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 overflow-y-auto p-4" onInteractOutside={(e) => { if (tourDriven) e.preventDefault(); }}>
        <SheetHeader className="p-0">
          <SheetTitle>{name}</SheetTitle>
        </SheetHeader>
        <NavLinks items={items} unread={unread} onNavigate={() => setOpen(false)} />
        <div className="mt-4 space-y-2 border-t pt-4">
          {tour ? <TourMenu tours={tour.tours} progress={tour.progress} onPick={() => setOpen(false)} /> : null}
          <SignOutButton />
        </div>
      </SheetContent>
    </Sheet>
  );
}
