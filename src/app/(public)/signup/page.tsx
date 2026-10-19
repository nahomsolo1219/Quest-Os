import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@db/client";
import { getActor } from "@/server/session";
import { homePathFor } from "@/server/authz";
import { publicCalculatorSettings } from "@/server/services/settings";
import { signUpOptions } from "@/server/services/signup";
import { SignupForm, type Prefill } from "./signup-form";
import { S } from "./strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up" };

const num = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined);

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await getActor();
  if (actor) redirect(homePathFor(actor.roles));
  const q = await searchParams;
  const [options, settings] = await Promise.all([signUpOptions(db), publicCalculatorSettings(db)]);
  const prefill: Prefill = {
    sex: q.sex === "male" || q.sex === "female" ? q.sex : undefined,
    age: num(q.age), weightKg: num(q.w), heightCm: num(q.h),
    activity: ["sedentary", "light", "moderate", "very_active", "athlete"].includes(q.activity ?? "") ? (q.activity as Prefill["activity"]) : undefined,
    goal: q.goal === "lean" || q.goal === "build" ? q.goal : undefined,
  };
  return (
    <main className="mx-auto max-w-xl px-4 pb-16">
      <header className="flex h-16 items-center justify-between">
        <Link href="/" className="text-xl font-extrabold text-primary">Quest Meals</Link>
        <Link href="/login" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold hover:bg-accent">{S.signIn}</Link>
      </header>
      <h1 className="text-3xl font-extrabold tracking-tight">{S.title}</h1>
      <SignupForm options={options} nutrition={settings.nutrition} prefill={prefill} source={q.source ?? null} />
      <p className="mt-6 text-sm text-muted-foreground">
        {S.haveAccount} <Link className="font-semibold text-primary underline" href="/login">{S.signIn}</Link>
      </p>
    </main>
  );
}
