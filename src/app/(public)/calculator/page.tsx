import Link from "next/link";
import { db } from "@db/client";
import { publicCalculatorSettings } from "@/server/services/settings";
import { CalculatorForm } from "./calculator-form";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calorie calculator" };

export default async function CalculatorPage() {
  const settings = await publicCalculatorSettings(db);
  return (
    <main className="mx-auto max-w-xl px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-extrabold text-primary">Quest Meals</Link>
        <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-accent">Sign in</Link>
      </header>
      <h1 className="text-3xl font-extrabold tracking-tight">{S.title}</h1>
      <p className="mt-2 text-muted-foreground">{S.intro}</p>
      <CalculatorForm nutrition={settings.nutrition} />
    </main>
  );
}
