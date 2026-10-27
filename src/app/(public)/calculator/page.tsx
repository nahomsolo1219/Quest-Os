import { PublicHeader } from "@/components/public/public-header";
import { db } from "@db/client";
import { publicCalculatorSettings } from "@/server/services/settings";
import { CalculatorForm } from "./calculator-form";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calorie calculator" };

export default async function CalculatorPage() {
  const settings = await publicCalculatorSettings(db);
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 lg:max-w-5xl">
      <PublicHeader />
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-primary">{S.title}</h1>
      <p className="mt-2 text-muted-foreground">{S.intro}</p>
      <CalculatorForm nutrition={settings.nutrition} />
    </main>
  );
}
