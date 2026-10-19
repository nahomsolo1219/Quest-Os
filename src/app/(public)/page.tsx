import Link from "next/link";
import { Button } from "@/components/ui/button";

const PACKAGES = [
  { name: "Essential", points: ["3 standing swaps", "Monthly nutritionist check-in", "Community access", "Pick-up or daily delivery"] },
  { name: "Performance", points: ["6 standing swaps", "Check-in every 2 weeks", "Monthly group Q&A with Dagi and Kidus", "Daily delivery included"] },
  { name: "Premium", points: ["10 standing swaps", "Weekly check-in", "Monthly 1:1 coaching call", "Daily delivery, priority time slot"] },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <span className="text-xl font-extrabold text-primary">Quest Meals</span>
        <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-accent">Sign in</Link>
      </header>
      <section className="py-10">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Meals built for your goal.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Three meals and a snack every service day, cooked at Adorsi Cafe to calories and macros set by our nutritionist.
          Coached by Dagi and Kidus.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-12 px-6 text-base"><Link href="/calculator">Find my calories</Link></Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base"><Link href="/signup">Start tomorrow</Link></Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Sign up and pay by 6 pm and your first meals arrive the next service day.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {PACKAGES.map((p) => (
          <div key={p.name} className="rounded-xl border p-4">
            <h2 className="text-lg font-bold">{p.name}</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{p.points.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        ))}
      </section>
      <section className="mt-10 rounded-xl bg-accent p-5 text-accent-foreground">
        <h2 className="font-bold">How paying works</h2>
        <p className="mt-1 text-sm">Pay by Telebirr, CBE transfer or cash at pick-up, then upload your receipt in the app. We confirm it and you are on the next production sheet.</p>
      </section>
    </main>
  );
}
