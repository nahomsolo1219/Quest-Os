import Link from "next/link";
import { PublicHeader } from "@/components/public/public-header";
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
    <main className="mx-auto w-full max-w-xl px-4 pb-16">
      <PublicHeader />
      <h1 className="mt-4 text-3xl font-bold tracking-tight text-primary">{S.title}</h1>
      <p className="mt-1 text-muted-foreground">{S.intro}</p>
      <div className="mt-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
        <SignupForm options={options} nutrition={settings.nutrition} prefill={prefill} source={q.source ?? null} />
      </div>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        {S.haveAccount}{" "}
        <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href="/login">{S.signIn}</Link>
      </p>
    </main>
  );
}
