import type { Metadata } from "next";
import { Noto_Sans_Ethiopic } from "next/font/google";
import { db } from "@db/client";
import { Logo } from "@/components/shell/logo";
import { signUpOptions } from "@/server/services/signup";
import { Experience } from "./experience";

// Served at "/" on questaddis.com before launch (see src/middleware.ts).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "Quest Meals: opening 30 November in Addis Ababa" },
  description: "Fresh, weighed meals portioned to your calories and protein, planned by coaches Dagi and Kidus. Fasting menu included. Save your spot.",
};

const ethiopic = Noto_Sans_Ethiopic({ subsets: ["ethiopic"], weight: ["600"], display: "swap", variable: "--font-ethiopic", preload: false });

/** Monday 30 November 2026, 00:00 Addis Ababa. */
const LAUNCH = Date.UTC(2026, 10, 29, 21, 0, 0);

export default async function ComingSoon({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { areas } = await signUpOptions(db).catch(() => ({ areas: [] as { id: string; name: string }[] }));
  const daysLeft = Math.max(0, Math.ceil((LAUNCH - Date.now()) / 86_400_000));
  return (
    <main className={`${ethiopic.variable} min-h-dvh bg-[#E4DFD0]`}>
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
        <header className="flex h-20 items-center justify-between gap-4">
          <Logo variant="horizontal" height={28} priority />
          <p className="text-sm font-semibold text-[#11301A]">Opens Monday 30 November</p>
        </header>
        <div className="pb-16 pt-6 lg:pb-24 lg:pt-10">
          <Experience areas={areas} source={q.src ?? q.utm_source ?? null} daysLeft={daysLeft} />
        </div>
      </div>
      <footer className="border-t border-[#11301A]/15">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-[#2E3830]/70 sm:px-8">Quest Meals, Addis Ababa</p>
      </footer>
    </main>
  );
}
