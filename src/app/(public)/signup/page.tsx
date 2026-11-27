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
    <main className="min-h-dvh bg-leaf lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="bg-leaf-dark px-4 pb-8 text-mist sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-12 lg:pb-12">
        <PublicHeader reversed />
        <div className="mt-6 max-w-md lg:mt-14">
          <h1 className="text-4xl font-extrabold tracking-tight text-white lg:text-5xl">{S.title}</h1>
          <p className="mt-3 text-lg text-mist/85">{S.intro}</p>
          <ol className="mt-8 hidden space-y-4 sm:block">
            {S.whatNext.map((n, i) => (
              <li key={n.title} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-extrabold text-forest">{i + 1}</span>
                <div>
                  <p className="font-semibold text-white">{n.title}</p>
                  <p className="text-sm text-mist/75">{n.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p lang="am" className="mt-auto hidden pt-10 text-lg font-semibold text-lime lg:block">ምግብዎ፣ በግብዎ ልክ።</p>
      </aside>
      <section className="px-4 py-6 sm:px-8 lg:px-12 lg:py-14">
        <div className="mx-auto max-w-xl rounded-2xl border bg-card p-4 shadow-lg sm:p-6">
          <SignupForm options={options} nutrition={settings.nutrition} prefill={prefill} source={q.source ?? null} />
        </div>
        <p className="mt-4 text-center text-sm text-forest">
          {S.haveAccount}{" "}
          <Link className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4" href="/login">{S.signIn}</Link>
        </p>
      </section>
    </main>
  );
}
