import type { Metadata } from "next";
import { Dumbbell, Leaf, Scale } from "lucide-react";
import { db } from "@db/client";
import { Logo } from "@/components/shell/logo";
import { BrandRings } from "@/components/public/brand-rings";
import { signUpOptions } from "@/server/services/signup";
import { Countdown } from "./countdown";
import { WaitlistForm } from "./waitlist-form";

// Served at "/" on questaddis.com before launch (see src/middleware.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Quest Meals · Opening 30 November in Addis" },
  description: "Macro-counted meals built by coaches Dagi and Kidus, cooked fresh in Addis Ababa. Fasting menu included. Join the waitlist.",
};

const POINTS = [
  { icon: Dumbbell, title: "Built by coaches", text: "Plans from Dagi and Kidus, athletes who train Addis every day." },
  { icon: Scale, title: "Your macros, measured", text: "Every meal weighed to your calories and protein. No counting on your side." },
  { icon: Leaf, title: "Fasting-friendly", text: "A full fasting menu (ጾም) that still hits your protein." },
];

export default async function ComingSoon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { areas } = await signUpOptions(db).catch(() => ({ areas: [] as { id: string; name: string }[] }));
  return (
    <main className="min-h-dvh bg-forest text-mist">
      <div className="relative overflow-hidden">
        <BrandRings className="pointer-events-none absolute -right-24 -top-24 size-[22rem] text-lime/15 lg:-right-10 lg:size-[34rem]" />
        <div className="relative mx-auto grid w-full max-w-5xl grid-cols-1 gap-10 px-4 pb-14 pt-6 lg:grid-cols-[1.1fr_1fr] lg:pt-10">
          <div className="min-w-0">
            <Logo variant="horizontal-reversed" height={30} priority />
            <p className="mt-10 text-sm font-semibold uppercase tracking-wider text-lime">Opening Monday 30 November · Addis Ababa</p>
            <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl">Meals built for your goal.</h1>
            <p className="mt-4 max-w-prose text-lg text-mist/85">
              Fresh, macro-counted meals cooked daily in Addis and coached by Dagi and Kidus. Join the waitlist to get first access when we open.
            </p>
            <Countdown />
            <ul className="mt-10 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime/15 text-lime"><p.icon className="size-5" aria-hidden /></span>
                  <div>
                    <p className="font-semibold text-white">{p.title}</p>
                    <p className="text-sm text-mist/75">{p.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0 self-start rounded-2xl bg-card p-5 text-foreground shadow-xl sm:p-6 lg:mt-14">
            <h2 className="text-xl font-bold text-primary">Join the waitlist</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">Takes 30 seconds. We’ll message you before launch.</p>
            <WaitlistForm areas={areas} source={q.src ?? q.utm_source ?? null} />
          </div>
        </div>
      </div>
      <footer className="border-t border-white/10">
        <p className="mx-auto max-w-5xl px-4 py-6 text-sm text-mist/60">© Quest Meals · Addis Ababa</p>
      </footer>
    </main>
  );
}
